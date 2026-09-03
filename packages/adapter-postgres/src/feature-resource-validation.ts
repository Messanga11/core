import type { JsonValue } from "@messanga11/core";
import type { CrudListRequest, CrudPort } from "@messanga11/core/crud";
import type { PostgresFeatureResourceDefinition } from "./feature-resource.js";

const RESOURCE_IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const FIELD_IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

export function prepareList(
  resources: Readonly<Record<string, PostgresFeatureResourceDefinition>>,
  request: CrudListRequest,
): PostgresFeatureResourceDefinition {
  requireTenant(request.tenantId);
  assertPagination(request.limit, request.offset);
  const definition = getResource(resources, request.resource);
  for (const filter of request.filters ?? [])
    getField(definition, filter.field);
  for (const sort of request.sort ?? []) getField(definition, sort.field);
  return definition;
}

export function prepareWrite(
  resources: Readonly<Record<string, PostgresFeatureResourceDefinition>>,
  request: Parameters<CrudPort["create"]>[0],
): PostgresFeatureResourceDefinition {
  requireTenant(request.tenantId);
  requireIdempotencyKey(request.idempotencyKey);
  const definition = getResource(resources, request.resource);
  validateRecord(definition, request.values);
  return definition;
}

export function prepareVersionedWrite(
  resources: Readonly<Record<string, PostgresFeatureResourceDefinition>>,
  request:
    | Parameters<CrudPort["update"]>[0]
    | Parameters<CrudPort["delete"]>[0],
): PostgresFeatureResourceDefinition {
  requireTenant(request.tenantId);
  requireIdempotencyKey(request.idempotencyKey);
  if (
    !Number.isSafeInteger(request.expectedVersion) ||
    (request.expectedVersion ?? 0) < 1
  ) {
    throw new TypeError("Expected version is required");
  }
  const definition = getResource(resources, request.resource);
  if ("values" in request) validateRecord(definition, request.values);
  return definition;
}

export function validateResources(
  resources: Readonly<Record<string, PostgresFeatureResourceDefinition>>,
) {
  for (const [resource, definition] of Object.entries(resources)) {
    if (!RESOURCE_IDENTIFIER.test(resource))
      throw new TypeError("Invalid resource");
    if (!definition.fields.id)
      throw new TypeError("Resource id field is required");
    for (const field of Object.keys(definition.fields)) {
      if (!FIELD_IDENTIFIER.test(field))
        throw new TypeError("Invalid resource field");
    }
  }
  return resources;
}

export function validateRecord(
  definition: PostgresFeatureResourceDefinition,
  value: JsonValue,
): Record<string, JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError("Expected record");
  }
  const record: Record<string, JsonValue> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    getField(definition, field);
    record[field] = fieldValue;
  }
  return record;
}

export function getResource(
  resources: Readonly<Record<string, PostgresFeatureResourceDefinition>>,
  resource: string,
) {
  const definition = resources[resource];
  if (!definition) throw new TypeError("Unknown resource");
  return definition;
}

export function getField(
  definition: PostgresFeatureResourceDefinition,
  field: string,
) {
  const storage = definition.fields[field];
  if (!storage) throw new TypeError("Unknown field");
  return storage;
}

export function normalizeFilterValue(
  value: JsonValue,
): string | number | boolean {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  throw new TypeError("Invalid filter value");
}

export function requireTenant(value: string | undefined): string {
  if (!value || value.length > 128)
    throw new TypeError("Tenant context is required");
  return value;
}

export function requireIdempotencyKey(value: string | undefined): string {
  if (!value || value.length < 16 || value.length > 128) {
    throw new TypeError("Idempotency key is required");
  }
  return value;
}

function assertPagination(limit: number, offset: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("Invalid limit");
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError("Invalid offset");
  }
}
