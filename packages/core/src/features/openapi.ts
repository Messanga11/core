import type { JsonValue } from "../contracts";
import type {
  CompiledFeatureCatalog,
  FeatureOperationDefinition,
  FeatureValueSchema,
} from "./feature-definition";

export function generateFeatureOpenApiDocument(
  catalog: CompiledFeatureCatalog,
  options: { readonly serverUrl: string },
): JsonValue {
  const serverUrl = normalizedServerUrl(options.serverUrl);
  const paths: Record<string, JsonValue> = {};
  for (const [operationId, operation] of Object.entries(catalog.operations)) {
    const [featureId, localOperationId] = splitOperationId(operationId);
    const path = `/api/features/${featureId}/${localOperationId}`;
    const method = operation.method.toLowerCase();
    const pathItem = (paths[path] ?? {}) as Record<string, JsonValue>;
    pathItem[method] = operationDocument(operationId, operation);
    paths[path] = pathItem;
  }
  return {
    components: {
      securitySchemes: {
        bearerToken: { scheme: "bearer", type: "http" },
        sessionCookie: { in: "cookie", name: "__Host-session", type: "apiKey" },
      },
    },
    info: {
      description: catalog.definition.application.description,
      title: catalog.definition.application.name,
      version: String(catalog.definition.schemaVersion),
    },
    openapi: "3.1.0",
    paths,
    servers: [{ url: serverUrl }],
  };
}

function operationDocument(
  operationId: string,
  operation: FeatureOperationDefinition,
): JsonValue {
  return {
    operationId,
    ...(operation.idempotency?.required
      ? {
          parameters: [
            {
              in: "header",
              name: "x-idempotency-key",
              required: true,
              schema: { maxLength: 128, minLength: 16, type: "string" },
            },
          ],
        }
      : {}),
    requestBody: {
      content: {
        "application/json": { schema: toJsonSchema(operation.input) },
      },
      required: true,
    },
    responses: {
      "200": {
        content: {
          "application/json": { schema: toJsonSchema(operation.output) },
        },
        description: "Successful operation.",
      },
      "400": { description: "Invalid request." },
      "401": { description: "Authentication required." },
      "403": { description: "Operation denied." },
      "429": { description: "Rate limit exceeded." },
    },
    security: operation.access.mode === "public" ? [] : [{ sessionCookie: [] }],
    tags: [operationId.split(".")[0] ?? "feature"],
  };
}

function toJsonSchema(schema: FeatureValueSchema): JsonValue {
  if (schema.type === "decimal") {
    return {
      pattern: decimalPattern(schema.precision, schema.scale),
      type: "string",
      "x-messanga-decimal": {
        precision: schema.precision,
        scale: schema.scale,
      },
    };
  }
  if (schema.type === "reference") {
    return {
      maxLength: 128,
      minLength: 1,
      type: "string",
      "x-resource": schema.resource,
    };
  }
  if (schema.type === "nullable") {
    return { anyOf: [toJsonSchema(schema.value), { type: "null" }] };
  }
  if (schema.type === "union") {
    return { oneOf: schema.oneOf.map(toJsonSchema) };
  }
  if (schema.type === "array") {
    return { ...schema, items: toJsonSchema(schema.items) };
  }
  if (schema.type === "object") {
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([name, value]) => [
          name,
          toJsonSchema(value),
        ]),
      ),
    };
  }
  return schema;
}

function decimalPattern(precision: number, scale: number): string {
  const integerDigits = precision - scale;
  return scale === 0
    ? `^-?\\d{1,${integerDigits}}$`
    : `^-?\\d{1,${integerDigits}}(?:\\.\\d{1,${scale}})?$`;
}

function splitOperationId(id: string): readonly [string, string] {
  const separator = id.indexOf(".");
  if (separator < 1 || separator === id.length - 1) {
    throw new TypeError("Invalid compiled operation identifier.");
  }
  return [id.slice(0, separator), id.slice(separator + 1)];
}

function normalizedServerUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("OpenAPI server URL must use HTTP or HTTPS.");
  }
  return url.href;
}
