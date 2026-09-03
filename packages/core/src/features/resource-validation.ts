import type {
  FeatureResourceDefinition,
  FeatureValueSchema,
} from "./feature-definition";
import { FeatureDefinitionError } from "./feature-error";
import { validateFeatureValue } from "./value-schema";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const FIELD_IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

export function validateResourceDefinition(
  resource: FeatureResourceDefinition,
  path: string,
): void {
  assertIdentifier(resource.id, `${path}.id`);
  const fields = Object.entries(resource.fields);
  if (fields.length === 0) fail(`${path}.fields`);
  for (const [name, field] of fields) {
    if (!FIELD_IDENTIFIER.test(name)) fail(`${path}.fields.${name}`);
    validateSchema(field.schema, `${path}.fields.${name}.schema`);
    validateComputedField(resource, name, path);
  }
  if (resource.fields.id?.schema.type !== "string") fail(`${path}.fields.id`);
  validateConcurrency(resource, path);
  validateIndexes(resource, path);
  validateOwnership(resource, path);
  validateRelations(resource, path);
  validateRetention(resource, path);
  validateSeeds(resource, fields, path);
}

function validateComputedField(
  resource: FeatureResourceDefinition,
  name: string,
  path: string,
): void {
  const computed = resource.fields[name]?.computed;
  if (!computed) return;
  if (
    !IDENTIFIER.test(computed.handler) ||
    computed.dependencies.length === 0
  ) {
    fail(`${path}.fields.${name}.computed`);
  }
  if (
    resource.fields[name]?.create !== false ||
    resource.fields[name]?.update !== false
  ) {
    fail(`${path}.fields.${name}.computed`);
  }
  for (const dependency of computed.dependencies) {
    if (!resource.fields[dependency]) {
      fail(`${path}.fields.${name}.computed.dependencies`);
    }
  }
}

function validateConcurrency(
  resource: FeatureResourceDefinition,
  path: string,
): void {
  if (!resource.concurrency) return;
  const field = resource.fields[resource.concurrency.field];
  if (
    field?.schema.type !== "integer" ||
    field.create !== false ||
    field.update !== false
  ) {
    fail(`${path}.concurrency.field`);
  }
}

function validateIndexes(
  resource: FeatureResourceDefinition,
  path: string,
): void {
  const ids = new Set<string>();
  for (const [index, definition] of (resource.indexes ?? []).entries()) {
    assertIdentifier(definition.id, `${path}.indexes.${index}.id`);
    if (ids.has(definition.id) || definition.fields.length === 0) {
      fail(`${path}.indexes.${index}`);
    }
    ids.add(definition.id);
    for (const field of definition.fields) {
      if (!resource.fields[field]) fail(`${path}.indexes.${index}.fields`);
    }
  }
}

function validateOwnership(
  resource: FeatureResourceDefinition,
  path: string,
): void {
  if (resource.ownership?.mode !== "tenant") return;
  const field = resource.fields[resource.ownership.field];
  if (
    field?.exposure !== "private" ||
    field.create !== false ||
    field.update !== false
  ) {
    fail(`${path}.ownership.field`);
  }
}

function validateRelations(
  resource: FeatureResourceDefinition,
  path: string,
): void {
  for (const [index, relation] of (resource.relations ?? []).entries()) {
    const field = resource.fields[relation.field];
    if (!field || !IDENTIFIER.test(relation.resource)) {
      fail(`${path}.relations.${index}`);
    }
    if (
      relation.type !== "one-to-many" &&
      field.schema.type !== "reference" &&
      field.schema.type !== "nullable"
    ) {
      fail(`${path}.relations.${index}.field`);
    }
    if (relation.onDelete === "set-null" && field.schema.type !== "nullable") {
      fail(`${path}.relations.${index}.onDelete`);
    }
  }
}

function validateRetention(
  resource: FeatureResourceDefinition,
  path: string,
): void {
  const retention = resource.retention;
  if (!retention) return;
  const archive = retention.archiveAfterDays;
  const remove = retention.deleteAfterDays;
  if (
    archive !== undefined &&
    (!Number.isSafeInteger(archive) || archive < 1)
  ) {
    fail(`${path}.retention.archiveAfterDays`);
  }
  if (remove !== undefined && (!Number.isSafeInteger(remove) || remove < 1)) {
    fail(`${path}.retention.deleteAfterDays`);
  }
  if (archive !== undefined && remove !== undefined && remove < archive) {
    fail(`${path}.retention.deleteAfterDays`);
  }
}

function validateSeeds(
  resource: FeatureResourceDefinition,
  fields: readonly [string, FeatureResourceDefinition["fields"][string]][],
  path: string,
): void {
  const schema = {
    additionalProperties: false,
    properties: Object.fromEntries(
      fields.map(([name, field]) => [name, field.schema]),
    ),
    required: fields
      .filter(([, field]) => field.required)
      .map(([name]) => name),
    type: "object",
  } as const;
  for (const [index, record] of (resource.seed ?? []).entries()) {
    if (!validateFeatureValue(schema, record).success)
      fail(`${path}.seed.${index}`);
  }
}

function validateSchema(schema: FeatureValueSchema, path: string): void {
  if (schema.type === "decimal") {
    if (
      !Number.isSafeInteger(schema.precision) ||
      !Number.isSafeInteger(schema.scale) ||
      schema.precision < 1 ||
      schema.scale < 0 ||
      schema.scale > schema.precision
    )
      fail(path);
    return;
  }
  if (schema.type === "union") {
    if (schema.oneOf.length < 2 || schema.oneOf.length > 16) fail(path);
    for (const [index, variant] of schema.oneOf.entries()) {
      validateSchema(variant, `${path}.oneOf.${index}`);
    }
    return;
  }
  if (schema.type === "nullable") {
    validateSchema(schema.value, `${path}.value`);
    return;
  }
  if (schema.type === "reference") {
    assertIdentifier(schema.resource, `${path}.resource`);
    return;
  }
  if (schema.type === "array") {
    validateBounds(schema.minItems, schema.maxItems, path);
    validateSchema(schema.items, `${path}.items`);
    return;
  }
  if (schema.type === "object") {
    for (const name of schema.required ?? []) {
      if (!schema.properties[name]) fail(`${path}.required`);
    }
    for (const [name, property] of Object.entries(schema.properties)) {
      if (!FIELD_IDENTIFIER.test(name)) fail(`${path}.properties.${name}`);
      validateSchema(property, `${path}.properties.${name}`);
    }
    return;
  }
  if (schema.type === "string") {
    validateBounds(schema.minLength, schema.maxLength, path);
  } else if (schema.type === "number" || schema.type === "integer") {
    validateBounds(schema.minimum, schema.maximum, path);
  }
}

function validateBounds(
  minimum: number | undefined,
  maximum: number | undefined,
  path: string,
): void {
  if (minimum !== undefined && (!Number.isFinite(minimum) || minimum < 0))
    fail(path);
  if (maximum !== undefined && (!Number.isFinite(maximum) || maximum < 0))
    fail(path);
  if (minimum !== undefined && maximum !== undefined && maximum < minimum)
    fail(path);
}

function assertIdentifier(value: string, path: string): void {
  if (!IDENTIFIER.test(value)) fail(path);
}

function fail(path: string): never {
  throw new FeatureDefinitionError("INVALID_DEFINITION", path);
}
