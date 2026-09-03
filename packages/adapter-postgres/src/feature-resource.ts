import type {
  CrudFilter,
  CrudListRequest,
  CrudPort,
  CrudRecord,
  CrudSort,
} from "@messanga11/core/crud";
import {
  getField,
  getResource,
  normalizeFilterValue,
  prepareList,
  prepareVersionedWrite,
  prepareWrite,
  requireIdempotencyKey,
  requireTenant,
  validateRecord,
  validateResources,
} from "./feature-resource-validation.js";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

export type PostgresFeatureFieldStorage = "boolean" | "number" | "text";

export interface PostgresFeatureResourceDefinition {
  readonly fields: Readonly<Record<string, PostgresFeatureFieldStorage>>;
}

export interface PostgresFeatureResourceAdapterOptions {
  readonly pool: SqlPoolPort;
  readonly resources: Readonly<
    Record<string, PostgresFeatureResourceDefinition>
  >;
}

// GUARDRAIL[postgres-feature-resource]: Every query carries the trusted tenant and also executes behind PostgreSQL RLS.
export function createPostgresFeatureResourceAdapter(
  options: PostgresFeatureResourceAdapterOptions,
): CrudPort {
  const resources = validateResources(options.resources);
  return {
    create: async (request) => {
      const definition = prepareWrite(resources, request);
      return withTenant(options.pool, request.tenantId, (client, tenantId) =>
        createRecord(client, tenantId, request, definition),
      );
    },
    delete: async (request) => {
      prepareVersionedWrite(resources, request);
      await withTenant(options.pool, request.tenantId, (client, tenantId) =>
        deleteRecord(client, tenantId, request),
      );
    },
    get: async (request) => {
      getResource(resources, request.resource);
      return withTenant(options.pool, request.tenantId, (client, tenantId) =>
        getRecord(client, tenantId, request.resource, request.id),
      );
    },
    list: async (request) => {
      const definition = prepareList(resources, request);
      return withTenant(options.pool, request.tenantId, (client, tenantId) =>
        listRecords(client, tenantId, request, definition),
      );
    },
    update: async (request) => {
      const definition = prepareVersionedWrite(resources, request);
      return withTenant(options.pool, request.tenantId, (client, tenantId) =>
        updateRecord(client, tenantId, request, definition),
      );
    },
  };
}

async function withTenant<Result>(
  pool: SqlPoolPort,
  tenantId: string | undefined,
  work: (client: SqlClientPort, tenantId: string) => Promise<Result>,
): Promise<Result> {
  const trustedTenantId = requireTenant(tenantId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      trustedTenantId,
    ]);
    const value = await work(client, trustedTenantId);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release?.();
  }
}

async function createRecord(
  client: SqlClientPort,
  tenantId: string,
  request: Parameters<CrudPort["create"]>[0],
  definition: PostgresFeatureResourceDefinition,
): Promise<CrudRecord> {
  await lockIdempotency(
    client,
    tenantId,
    request.resource,
    request.idempotencyKey,
  );
  const replay = await readReplay(
    client,
    tenantId,
    request.resource,
    "create",
    request.idempotencyKey,
  );
  if (replay) return replay;
  const values = validateRecord(definition, request.values);
  const record = { ...values, id: crypto.randomUUID() } satisfies CrudRecord;
  const inserted = await client.query<StoredRecordRow>(
    "INSERT INTO messanga11_feature_records (tenant_id, resource, id, data) VALUES ($1, $2, $3, $4::jsonb) RETURNING data, version",
    [tenantId, request.resource, record.id, record],
  );
  const result = decodeStoredRecord(inserted.rows[0]);
  await storeReplay(
    client,
    tenantId,
    request.resource,
    "create",
    request.idempotencyKey,
    result,
  );
  return result;
}

async function updateRecord(
  client: SqlClientPort,
  tenantId: string,
  request: Parameters<CrudPort["update"]>[0],
  definition: PostgresFeatureResourceDefinition,
): Promise<CrudRecord> {
  await lockIdempotency(
    client,
    tenantId,
    request.resource,
    request.idempotencyKey,
  );
  const replay = await readReplay(
    client,
    tenantId,
    request.resource,
    "update",
    request.idempotencyKey,
  );
  if (replay) return replay;
  const values = validateRecord(definition, request.values);
  const updated = await client.query<StoredRecordRow>(
    "UPDATE messanga11_feature_records SET data = data || $4::jsonb, version = version + 1, updated_at = clock_timestamp() WHERE tenant_id = $1 AND resource = $2 AND id = $3 AND version = $5 RETURNING data, version",
    [tenantId, request.resource, request.id, values, request.expectedVersion],
  );
  const row = updated.rows[0];
  if (!row) throw new Error("Resource version conflict");
  const result = decodeStoredRecord(row);
  await storeReplay(
    client,
    tenantId,
    request.resource,
    "update",
    request.idempotencyKey,
    result,
  );
  return result;
}

async function deleteRecord(
  client: SqlClientPort,
  tenantId: string,
  request: Parameters<CrudPort["delete"]>[0],
): Promise<void> {
  const key = requireIdempotencyKey(request.idempotencyKey);
  await lockIdempotency(client, tenantId, request.resource, key);
  const replay = await readReplay(
    client,
    tenantId,
    request.resource,
    "delete",
    key,
  );
  if (replay) return;
  const deleted = await client.query(
    "DELETE FROM messanga11_feature_records WHERE tenant_id = $1 AND resource = $2 AND id = $3 AND version = $4",
    [tenantId, request.resource, request.id, request.expectedVersion],
  );
  if (deleted.rowCount !== 1) throw new Error("Resource version conflict");
  await storeReplay(client, tenantId, request.resource, "delete", key, {
    id: request.id,
  });
}

async function getRecord(
  client: SqlClientPort,
  tenantId: string,
  resource: string,
  id: string,
): Promise<CrudRecord | undefined> {
  const result = await client.query<StoredRecordRow>(
    "SELECT data, version FROM messanga11_feature_records WHERE tenant_id = $1 AND resource = $2 AND id = $3",
    [tenantId, resource, id],
  );
  return result.rows[0] ? decodeStoredRecord(result.rows[0]) : undefined;
}

async function listRecords(
  client: SqlClientPort,
  tenantId: string,
  request: CrudListRequest,
  definition: PostgresFeatureResourceDefinition,
) {
  const query = buildListQuery(definition, request, tenantId);
  const rows = await client.query<StoredRecordRow>(query.select, query.values);
  const count = await client.query<{ count: string }>(
    query.count,
    query.filterValues,
  );
  return {
    records: rows.rows.map(decodeStoredRecord),
    total: Number.parseInt(count.rows[0]?.count ?? "0", 10),
  };
}

function buildListQuery(
  definition: PostgresFeatureResourceDefinition,
  request: CrudListRequest,
  tenantId: string,
) {
  const values: unknown[] = [tenantId, request.resource];
  const filters = buildFilters(definition, request.filters, values);
  const filterValues = [...values];
  const order = buildSort(definition, request.sort, values);
  values.push(request.limit, request.offset);
  const pagination = ` LIMIT $${values.length - 1} OFFSET $${values.length}`;
  const base = ` FROM messanga11_feature_records WHERE tenant_id = $1 AND resource = $2${filters}`;
  return {
    count: `SELECT count(*)::text AS count${base}`,
    filterValues,
    select: `SELECT data, version${base}${order}${pagination}`,
    values,
  };
}

function buildFilters(
  definition: PostgresFeatureResourceDefinition,
  filters: readonly CrudFilter[] | undefined,
  values: unknown[],
): string {
  if (!filters?.length) return "";
  const clauses: string[] = [];
  for (const filter of filters) {
    const storage = getField(definition, filter.field);
    values.push(filter.field);
    const expression = fieldExpression(storage, values.length);
    clauses.push(buildFilterClause(expression, filter, values));
  }
  return ` AND ${clauses.join(" AND ")}`;
}

function buildFilterClause(
  expression: string,
  filter: CrudFilter,
  values: unknown[],
): string {
  if (filter.operator === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0)
      return "FALSE";
    const placeholders = filter.value.map((value) => {
      values.push(normalizeFilterValue(value));
      return `$${values.length}`;
    });
    return `${expression} IN (${placeholders.join(", ")})`;
  }
  values.push(normalizeFilterValue(filter.value));
  const placeholder = `$${values.length}`;
  if (filter.operator === "contains") {
    return `${expression} ILIKE '%' || ${placeholder} || '%'`;
  }
  const operator =
    filter.operator === "eq" ? "=" : filter.operator.toUpperCase();
  return `${expression} ${operator} ${placeholder}`;
}

function buildSort(
  definition: PostgresFeatureResourceDefinition,
  sort: readonly CrudSort[] | undefined,
  values: unknown[],
): string {
  if (!sort?.length) return "";
  const clauses = sort.map((item) => {
    const storage = getField(definition, item.field);
    if (item.direction !== "asc" && item.direction !== "desc") {
      throw new TypeError("Invalid sort");
    }
    values.push(item.field);
    return `${fieldExpression(storage, values.length)} ${item.direction.toUpperCase()}`;
  });
  return ` ORDER BY ${clauses.join(", ")}`;
}

function fieldExpression(
  storage: PostgresFeatureFieldStorage,
  parameter: number,
): string {
  const value = `data ->> $${parameter}`;
  if (storage === "number") return `(${value})::numeric`;
  if (storage === "boolean") return `(${value})::boolean`;
  return value;
}

async function lockIdempotency(
  client: SqlClientPort,
  tenantId: string,
  resource: string,
  key: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `${tenantId}:${resource}:${key}`,
  ]);
}

async function readReplay(
  client: SqlClientPort,
  tenantId: string,
  resource: string,
  operation: string,
  key: string,
): Promise<CrudRecord | undefined> {
  const result = await client.query<{ result: unknown }>(
    "SELECT result FROM messanga11_feature_idempotency WHERE tenant_id = $1 AND resource = $2 AND operation = $3 AND idempotency_key = $4",
    [tenantId, resource, operation, key],
  );
  return result.rows[0] ? decodeRecord(result.rows[0].result) : undefined;
}

async function storeReplay(
  client: SqlClientPort,
  tenantId: string,
  resource: string,
  operation: string,
  key: string,
  result: CrudRecord,
): Promise<void> {
  await client.query(
    "INSERT INTO messanga11_feature_idempotency (tenant_id, resource, operation, idempotency_key, result) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [tenantId, resource, operation, key, result],
  );
}

function decodeRecord(value: unknown): CrudRecord {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError("Invalid database record");
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record.id !== "string")
    throw new TypeError("Invalid database record");
  return record as CrudRecord;
}

interface StoredRecordRow extends Record<string, unknown> {
  readonly data: unknown;
  readonly version: unknown;
}

function decodeStoredRecord(row: StoredRecordRow | undefined): CrudRecord {
  if (!row) throw new TypeError("Invalid database record");
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new TypeError("Invalid database record");
  }
  return Object.freeze({ ...decodeRecord(row.data), version });
}

async function rollback(client: SqlClientPort): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transactional failure.
  }
}
