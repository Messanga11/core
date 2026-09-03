import type { JsonValue } from "../contracts";
import type { CrudFilter, CrudPort, CrudRecord, CrudSort } from "../crud";
import type {
  FeatureOperationHandler,
  FeatureOperationInvocation,
} from "./feature-runtime";

export const FEATURE_CRUD_HANDLER_IDS = [
  "crud.create",
  "crud.delete",
  "crud.get",
  "crud.list",
  "crud.update",
] as const;

// GUARDRAIL[feature-crud]: Built-in handlers derive the resource key exclusively from the compiled operation.
export function createFeatureCrudHandlers(
  port: CrudPort,
): Readonly<Record<string, FeatureOperationHandler>> {
  return Object.freeze({
    "crud.create": (invocation) => createRecord(port, invocation),
    "crud.delete": (invocation) => deleteRecord(port, invocation),
    "crud.get": (invocation) => getRecord(port, invocation),
    "crud.list": (invocation) => listRecords(port, invocation),
    "crud.update": (invocation) => updateRecord(port, invocation),
  });
}

async function listRecords(
  port: CrudPort,
  invocation: FeatureOperationInvocation,
): Promise<JsonValue> {
  const input = readObject(invocation.input);
  const filters = readFilters(input.filters);
  const sort = readSort(input.sort);
  const result = await port.list({
    ...(filters ? { filters } : {}),
    limit: readNumber(input.limit),
    offset: readNumber(input.offset),
    resource: resourceKey(invocation),
    ...(sort ? { sort } : {}),
    ...tenantScope(invocation),
  });
  return { records: result.records, total: result.total };
}

async function getRecord(
  port: CrudPort,
  invocation: FeatureOperationInvocation,
): Promise<JsonValue> {
  const record = await port.get({
    id: readString(readObject(invocation.input).id),
    resource: resourceKey(invocation),
    ...tenantScope(invocation),
  });
  return record ? { found: true, record } : { found: false };
}

async function createRecord(
  port: CrudPort,
  invocation: FeatureOperationInvocation,
): Promise<CrudRecord> {
  return port.create({
    idempotencyKey: readIdempotencyKey(invocation),
    resource: resourceKey(invocation),
    ...tenantScope(invocation),
    values: readObject(invocation.input).values ?? null,
  });
}

async function updateRecord(
  port: CrudPort,
  invocation: FeatureOperationInvocation,
): Promise<CrudRecord> {
  const input = readObject(invocation.input);
  return port.update({
    ...expectedVersion(input.expectedVersion),
    id: readString(input.id),
    idempotencyKey: readIdempotencyKey(invocation),
    resource: resourceKey(invocation),
    ...tenantScope(invocation),
    values: input.values ?? null,
  });
}

async function deleteRecord(
  port: CrudPort,
  invocation: FeatureOperationInvocation,
): Promise<JsonValue> {
  const input = readObject(invocation.input);
  await port.delete({
    ...expectedVersion(input.expectedVersion),
    id: readString(input.id),
    idempotencyKey: readIdempotencyKey(invocation),
    resource: resourceKey(invocation),
    ...tenantScope(invocation),
  });
  return { deleted: true };
}

function expectedVersion(
  value: JsonValue | undefined,
): Readonly<{ expectedVersion: number }> | Readonly<Record<string, never>> {
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Expected version must be a positive integer");
  }
  return { expectedVersion: value };
}

function tenantScope(
  invocation: FeatureOperationInvocation,
): Readonly<{ tenantId: string }> | Readonly<Record<string, never>> {
  return invocation.context.tenantId
    ? { tenantId: invocation.context.tenantId }
    : {};
}

function resourceKey(invocation: FeatureOperationInvocation): string {
  if (!invocation.operation.resource) throw new TypeError("Missing resource");
  return `${invocation.featureId}.${invocation.operation.resource}`;
}

function readIdempotencyKey(invocation: FeatureOperationInvocation): string {
  if (!invocation.idempotencyKey)
    throw new TypeError("Missing idempotency key");
  return invocation.idempotencyKey;
}

function readObject(value: JsonValue): Readonly<Record<string, JsonValue>> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError("Expected object");
  }
  return value as Readonly<Record<string, JsonValue>>;
}

function readString(value: JsonValue | undefined): string {
  if (typeof value !== "string") throw new TypeError("Expected string");
  return value;
}

function readNumber(value: JsonValue | undefined): number {
  if (typeof value !== "number") throw new TypeError("Expected number");
  return value;
}

function readFilters(
  value: JsonValue | undefined,
): readonly CrudFilter[] | undefined {
  return value === undefined
    ? undefined
    : (value as unknown as readonly CrudFilter[]);
}

function readSort(
  value: JsonValue | undefined,
): readonly CrudSort[] | undefined {
  return value === undefined
    ? undefined
    : (value as unknown as readonly CrudSort[]);
}
