import type { JsonValue } from "@messanga11/core";
import type {
  CrudFilter,
  CrudListRequest,
  CrudPort,
  CrudRecord,
  CrudSort,
} from "@messanga11/core/crud";
import type Database from "better-sqlite3";

export interface SqliteFeatureResourceDefinition {
  readonly fields: readonly string[];
  readonly seed?: readonly Readonly<Record<string, JsonValue>>[];
}

export interface SqliteFeatureResourceAdapterOptions {
  readonly database: Database.Database;
  readonly resources: Readonly<Record<string, SqliteFeatureResourceDefinition>>;
  readonly table?: string;
}

const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESOURCE_IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const FIELD_IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

// GUARDRAIL[feature-resource-storage]: Resource and field identifiers are compiled allowlists, never client SQL.
export function createSqliteFeatureResourceAdapter(
  options: SqliteFeatureResourceAdapterOptions,
): CrudPort {
  const table = options.table ?? "messanga11_feature_records";
  assertSqlIdentifier(table);
  const resources = validateResources(options.resources);
  createTables(options.database, table);
  seedResources(options.database, table, resources);
  return {
    create: async (request) =>
      writeIdempotently(options.database, table, resources, "create", request),
    delete: async ({ id, resource }) => {
      getResource(resources, resource);
      options.database
        .prepare(`DELETE FROM ${table} WHERE resource = ? AND id = ?`)
        .run(resource, id);
    },
    get: async ({ id, resource }) => {
      getResource(resources, resource);
      const row = options.database
        .prepare(`SELECT data FROM ${table} WHERE resource = ? AND id = ?`)
        .get(resource, id) as { data: string } | undefined;
      return row ? decodeRecord(row.data) : undefined;
    },
    list: async (request) =>
      listRecords(options.database, table, resources, request),
    update: async (request) =>
      writeIdempotently(options.database, table, resources, "update", request),
  };
}

function createTables(database: Database.Database, table: string): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      resource TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (resource, id)
    );
    CREATE TABLE IF NOT EXISTS ${table}_idempotency (
      resource TEXT NOT NULL,
      operation TEXT NOT NULL,
      idempotencyKey TEXT NOT NULL,
      result TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (resource, operation, idempotencyKey)
    );
  `);
}

function seedResources(
  database: Database.Database,
  table: string,
  resources: Readonly<Record<string, SqliteFeatureResourceDefinition>>,
): void {
  const insert = database.prepare(
    `INSERT OR IGNORE INTO ${table} (resource, id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
  );
  const seed = database.transaction(() => {
    const now = new Date().toISOString();
    for (const [resource, definition] of Object.entries(resources)) {
      for (const record of definition.seed ?? []) {
        const checked = validateRecord(definition, record, true);
        insert.run(resource, checked.id, JSON.stringify(checked), now, now);
      }
    }
  });
  seed();
}

function writeIdempotently(
  database: Database.Database,
  table: string,
  resources: Readonly<Record<string, SqliteFeatureResourceDefinition>>,
  operation: "create" | "update",
  request:
    | Parameters<CrudPort["create"]>[0]
    | Parameters<CrudPort["update"]>[0],
): CrudRecord {
  const definition = getResource(resources, request.resource);
  const transaction = database.transaction(() => {
    const replay = readReplay(
      database,
      table,
      request.resource,
      operation,
      request.idempotencyKey,
    );
    if (replay) return replay;
    const values = validateRecord(definition, request.values, false);
    const id =
      operation === "update" && "id" in request
        ? request.id
        : typeof values.id === "string"
          ? values.id
          : crypto.randomUUID();
    const previous =
      operation === "update"
        ? readStoredRecord(database, table, request.resource, id)
        : undefined;
    if (operation === "update" && !previous)
      throw new Error("Resource not found");
    const record = { ...(previous ?? {}), ...values, id } as CrudRecord;
    validateRecord(definition, record, true);
    const now = new Date().toISOString();
    if (operation === "create") {
      database
        .prepare(
          `INSERT INTO ${table} (resource, id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(request.resource, id, JSON.stringify(record), now, now);
    } else {
      database
        .prepare(
          `UPDATE ${table} SET data = ?, version = version + 1, updatedAt = ? WHERE resource = ? AND id = ?`,
        )
        .run(JSON.stringify(record), now, request.resource, id);
    }
    database
      .prepare(
        `INSERT INTO ${table}_idempotency (resource, operation, idempotencyKey, result, createdAt) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        request.resource,
        operation,
        request.idempotencyKey,
        JSON.stringify(record),
        now,
      );
    return record;
  });
  return transaction();
}

function listRecords(
  database: Database.Database,
  table: string,
  resources: Readonly<Record<string, SqliteFeatureResourceDefinition>>,
  request: CrudListRequest,
) {
  const definition = getResource(resources, request.resource);
  assertPagination(request.limit, request.offset);
  const where = buildWhere(definition, request.filters);
  const order = buildOrder(definition, request.sort);
  const baseParams = [request.resource, ...where.params];
  const rows = database
    .prepare(
      `SELECT data FROM ${table} WHERE resource = ?${where.sql}${order.sql} LIMIT ? OFFSET ?`,
    )
    .all(...baseParams, ...order.params, request.limit, request.offset) as {
    data: string;
  }[];
  const count = database
    .prepare(
      `SELECT COUNT(*) AS count FROM ${table} WHERE resource = ?${where.sql}`,
    )
    .get(...baseParams) as { count: number };
  return {
    records: rows.map((row) => decodeRecord(row.data)),
    total: count.count,
  };
}

function buildWhere(
  definition: SqliteFeatureResourceDefinition,
  filters: readonly CrudFilter[] | undefined,
): { readonly params: readonly unknown[]; readonly sql: string } {
  if (!filters?.length) return { params: [], sql: "" };
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const filter of filters) {
    assertField(definition, filter.field);
    const expression = "json_extract(data, ?)";
    params.push(`$.${filter.field}`);
    if (filter.operator === "in") {
      appendInFilter(filter, expression, clauses, params);
      continue;
    }
    const operator =
      filter.operator === "eq"
        ? "="
        : filter.operator === "contains"
          ? "LIKE"
          : filter.operator.toUpperCase();
    clauses.push(`${expression} ${operator} ?`);
    params.push(
      filter.operator === "contains"
        ? `%${String(filter.value)}%`
        : filter.value,
    );
  }
  return { params, sql: ` AND ${clauses.join(" AND ")}` };
}

function appendInFilter(
  filter: CrudFilter,
  expression: string,
  clauses: string[],
  params: unknown[],
): void {
  if (!Array.isArray(filter.value) || filter.value.length === 0) {
    clauses.push("0 = 1");
    return;
  }
  clauses.push(`${expression} IN (${filter.value.map(() => "?").join(", ")})`);
  params.push(...filter.value);
}

function buildOrder(
  definition: SqliteFeatureResourceDefinition,
  sort: readonly CrudSort[] | undefined,
): { readonly params: readonly string[]; readonly sql: string } {
  if (!sort?.length) return { params: [], sql: "" };
  const clauses: string[] = [];
  const params: string[] = [];
  for (const item of sort) {
    assertField(definition, item.field);
    if (item.direction !== "asc" && item.direction !== "desc")
      throw new TypeError("Invalid sort");
    clauses.push(`json_extract(data, ?) ${item.direction.toUpperCase()}`);
    params.push(`$.${item.field}`);
  }
  return { params, sql: ` ORDER BY ${clauses.join(", ")}` };
}

function readReplay(
  database: Database.Database,
  table: string,
  resource: string,
  operation: string,
  idempotencyKey: string,
): CrudRecord | undefined {
  const row = database
    .prepare(
      `SELECT result FROM ${table}_idempotency WHERE resource = ? AND operation = ? AND idempotencyKey = ?`,
    )
    .get(resource, operation, idempotencyKey) as { result: string } | undefined;
  return row ? decodeRecord(row.result) : undefined;
}

function readStoredRecord(
  database: Database.Database,
  table: string,
  resource: string,
  id: string,
): CrudRecord | undefined {
  const row = database
    .prepare(`SELECT data FROM ${table} WHERE resource = ? AND id = ?`)
    .get(resource, id) as { data: string } | undefined;
  return row ? decodeRecord(row.data) : undefined;
}

function validateResources(
  resources: Readonly<Record<string, SqliteFeatureResourceDefinition>>,
): Readonly<Record<string, SqliteFeatureResourceDefinition>> {
  for (const [resource, definition] of Object.entries(resources)) {
    if (!RESOURCE_IDENTIFIER.test(resource))
      throw new TypeError("Invalid resource");
    if (!definition.fields.includes("id"))
      throw new TypeError("Resource id field is required");
    for (const field of definition.fields) {
      if (!FIELD_IDENTIFIER.test(field))
        throw new TypeError("Invalid resource field");
    }
  }
  return resources;
}

function validateRecord(
  definition: SqliteFeatureResourceDefinition,
  value: JsonValue,
  requireId: boolean,
): Record<string, JsonValue> & { readonly id?: string } {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new TypeError("Expected record");
  const record = value as Readonly<Record<string, JsonValue>>;
  for (const field of Object.keys(record)) assertField(definition, field);
  if (requireId && typeof record.id !== "string")
    throw new TypeError("Record id is required");
  return { ...record };
}

function getResource(
  resources: Readonly<Record<string, SqliteFeatureResourceDefinition>>,
  resource: string,
): SqliteFeatureResourceDefinition {
  const definition = resources[resource];
  if (!definition) throw new TypeError("Unknown resource");
  return definition;
}

function assertField(
  definition: SqliteFeatureResourceDefinition,
  field: string,
): void {
  if (!definition.fields.includes(field)) throw new TypeError("Unknown field");
}

function assertPagination(limit: number, offset: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new TypeError("Invalid limit");
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new TypeError("Invalid offset");
}

function assertSqlIdentifier(value: string): void {
  if (!SQL_IDENTIFIER.test(value)) throw new TypeError("Invalid table");
}

function decodeRecord(value: string): CrudRecord {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
    throw new TypeError("Invalid record");
  const id = (parsed as { readonly id?: unknown }).id;
  if (typeof id !== "string") throw new TypeError("Invalid record id");
  return parsed as CrudRecord;
}
