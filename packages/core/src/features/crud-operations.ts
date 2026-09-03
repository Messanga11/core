import type {
  FeatureAccessDefinition,
  FeatureOperationDefinition,
  FeatureResourceDefinition,
  FeatureValueSchema,
} from "./feature-definition";

export interface CreateFeatureCrudOperationsOptions {
  readonly auditPrefix: string;
  readonly readAccess: FeatureAccessDefinition;
  readonly resource: FeatureResourceDefinition;
  readonly writeAccess: FeatureAccessDefinition;
}

const RATE_LIMIT = { cost: 1, limit: 100, windowMs: 60_000 } as const;
const ID_SCHEMA = { maxLength: 128, minLength: 1, type: "string" } as const;
const VERSION_SCHEMA = { minimum: 1, type: "integer" } as const;

// SOT[feature-crud]: Generates the complete protected operation contract from one resource declaration.
export function createFeatureCrudOperations(
  options: CreateFeatureCrudOperationsOptions,
): readonly FeatureOperationDefinition[] {
  const record = createRecordSchema(options.resource);
  const createValues = createWriteSchema(options.resource, "create");
  const updateValues = createWriteSchema(options.resource, "update");
  return [
    queryOperation(options, "list", listInputSchema(options.resource), {
      additionalProperties: false,
      properties: {
        records: { items: record, maxItems: 100, type: "array" },
        total: { minimum: 0, type: "number" },
      },
      required: ["records", "total"],
      type: "object",
    }),
    queryOperation(options, "get", idInputSchema(), {
      additionalProperties: false,
      properties: { found: { type: "boolean" }, record },
      required: ["found"],
      type: "object",
    }),
    mutationOperation(
      options,
      "create",
      {
        additionalProperties: false,
        properties: { values: createValues },
        required: ["values"],
        type: "object",
      },
      record,
      "POST",
    ),
    mutationOperation(
      options,
      "update",
      {
        additionalProperties: false,
        properties: {
          ...versionProperty(options.resource),
          id: ID_SCHEMA,
          values: updateValues,
        },
        required: versionedRequired(options.resource, "values"),
        type: "object",
      },
      record,
      "PATCH",
    ),
    mutationOperation(
      options,
      "delete",
      idInputSchema(options.resource),
      {
        additionalProperties: false,
        properties: { deleted: { type: "boolean" } },
        required: ["deleted"],
        type: "object",
      },
      "DELETE",
    ),
  ];
}

function queryOperation(
  options: CreateFeatureCrudOperationsOptions,
  id: "get" | "list",
  input: FeatureValueSchema,
  output: FeatureValueSchema,
): FeatureOperationDefinition {
  return {
    access: options.readAccess,
    handler: `crud.${id}`,
    id,
    input,
    kind: "query",
    method: "POST",
    output,
    rateLimit: RATE_LIMIT,
    resource: options.resource.id,
  };
}

function mutationOperation(
  options: CreateFeatureCrudOperationsOptions,
  id: "create" | "delete" | "update",
  input: FeatureValueSchema,
  output: FeatureValueSchema,
  method: "DELETE" | "PATCH" | "POST",
): FeatureOperationDefinition {
  return {
    access: options.writeAccess,
    audit: { event: `${options.auditPrefix}.${id}`, required: true },
    handler: `crud.${id}`,
    id,
    idempotency: { required: true },
    input,
    kind: "mutation",
    method,
    output,
    rateLimit: RATE_LIMIT,
    resource: options.resource.id,
  };
}

function createRecordSchema(resource: FeatureResourceDefinition) {
  const fields = Object.entries(resource.fields).filter(
    ([, field]) => field.exposure !== "private",
  );
  return {
    additionalProperties: false,
    properties: Object.fromEntries(
      fields.map(([name, field]) => [name, field.schema]),
    ),
    required: fields
      .filter(([, field]) => field.required)
      .map(([name]) => name),
    type: "object",
  } as const satisfies FeatureValueSchema;
}

function createWriteSchema(
  resource: FeatureResourceDefinition,
  capability: "create" | "update",
) {
  const fields = Object.entries(resource.fields).filter(([name, field]) => {
    if (name === "id" || field.computed || field.exposure === "private") {
      return false;
    }
    return capability === "create"
      ? field.create !== false
      : field.update !== false;
  });
  return {
    additionalProperties: false,
    properties: Object.fromEntries(
      fields.map(([name, field]) => [name, field.schema]),
    ),
    required:
      capability === "create"
        ? fields.filter(([, field]) => field.required).map(([name]) => name)
        : [],
    type: "object",
  } as const satisfies FeatureValueSchema;
}

function idInputSchema(resource?: FeatureResourceDefinition) {
  return {
    additionalProperties: false,
    properties: { ...versionProperty(resource), id: ID_SCHEMA },
    required: versionedRequired(resource),
    type: "object",
  } as const satisfies FeatureValueSchema;
}

function versionProperty(resource: FeatureResourceDefinition | undefined) {
  return resource?.concurrency?.mode === "version"
    ? { expectedVersion: VERSION_SCHEMA }
    : {};
}

function versionedRequired(
  resource: FeatureResourceDefinition | undefined,
  extra?: string,
): readonly string[] {
  const required = ["id"];
  if (resource?.concurrency?.mode === "version")
    required.push("expectedVersion");
  if (extra) required.push(extra);
  return required;
}

function listInputSchema(resource: FeatureResourceDefinition) {
  const field = { enum: Object.keys(resource.fields), type: "string" } as const;
  return {
    additionalProperties: false,
    properties: {
      filters: {
        items: {
          additionalProperties: false,
          properties: {
            field,
            operator: {
              enum: ["contains", "eq", "gt", "gte", "in", "lt", "lte"],
              type: "string",
            },
            value: { maxLength: 240, type: "string" },
          },
          required: ["field", "operator", "value"],
          type: "object",
        },
        maxItems: 8,
        type: "array",
      },
      limit: { maximum: 100, minimum: 1, type: "number" },
      offset: { minimum: 0, type: "number" },
      sort: {
        items: {
          additionalProperties: false,
          properties: {
            direction: { enum: ["asc", "desc"], type: "string" },
            field,
          },
          required: ["direction", "field"],
          type: "object",
        },
        maxItems: 3,
        type: "array",
      },
    },
    required: ["limit", "offset"],
    type: "object",
  } as const satisfies FeatureValueSchema;
}
