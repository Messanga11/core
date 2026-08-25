import type { JsonValue } from "@messanga11/core";
import type {
  CrudFilter,
  CrudPort,
  CrudRecord,
  CrudSort,
} from "@messanga11/core/crud";
import type Database from "better-sqlite3";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export interface SqliteResourceDefinition {
  readonly columns: readonly string[];
  readonly jsonColumns?: readonly string[];
  readonly table: string;
}

export interface SqliteCrudAdapterOptions {
  readonly database: Database.Database;
  readonly resources: Readonly<Record<string, SqliteResourceDefinition>>;
}

export function createSqliteCrudAdapter(
  options: SqliteCrudAdapterOptions,
): CrudPort {
  const resources = validateResources(options.resources);
  return {
    create: async (request) => {
      const definition = getResource(resources, request.resource);
      const values = asObject(request.values);
      const id = readId(values) ?? crypto.randomUUID();
      const payload = { ...values, id };
      insert(options.database, definition, payload);
      return payload as CrudRecord;
    },
    delete: async ({ id, resource }) => {
      const definition = getResource(resources, resource);
      options.database
        .prepare(`DELETE FROM ${definition.table} WHERE id = ?`)
        .run(id);
    },
    get: async ({ id, resource }) => {
      const definition = getResource(resources, resource);
      const row = options.database
        .prepare(`SELECT * FROM ${definition.table} WHERE id = ?`)
        .get(id);
      return row ? decodeRecord(row, definition) : undefined;
    },
    list: async (request) =>
      list(options.database, getResource(resources, request.resource), request),
    update: async (request) => {
      const definition = getResource(resources, request.resource);
      const values = asObject(request.values);
      update(options.database, definition, request.id, values);
      const record = options.database
        .prepare(`SELECT * FROM ${definition.table} WHERE id = ?`)
        .get(request.id);
      if (!record) throw new Error("Resource not found");
      return decodeRecord(record, definition);
    },
  };
}

function list(
  database: Database.Database,
  definition: SqliteResourceDefinition,
  request: Parameters<CrudPort["list"]>[0],
) {
  const params: unknown[] = [];
  const where = buildWhere(definition, request.filters, params);
  const order = buildOrder(definition, request.sort);
  const rows = database
    .prepare(
      `SELECT * FROM ${definition.table}${where}${order} LIMIT ? OFFSET ?`,
    )
    .all(...params, request.limit, request.offset);
  const total = database
    .prepare(`SELECT COUNT(*) AS count FROM ${definition.table}${where}`)
    .get(...params) as { count: number };
  return {
    records: rows.map((row) => decodeRecord(row, definition)),
    total: total.count,
  };
}

function buildWhere(
  definition: SqliteResourceDefinition,
  filters: readonly CrudFilter[] | undefined,
  params: unknown[],
): string {
  if (!filters?.length) return "";
  const clauses: string[] = [];
  for (const filter of filters) {
    assertColumn(definition, filter.field);
    if (filter.operator === "in") {
      appendInFilter(filter, clauses, params);
      continue;
    }
    const operator =
      filter.operator === "eq"
        ? "="
        : filter.operator === "contains"
          ? "LIKE"
          : filter.operator.toUpperCase();
    clauses.push(`${filter.field} ${operator} ?`);
    params.push(
      filter.operator === "contains"
        ? `%${String(filter.value)}%`
        : toSql(filter.value),
    );
  }
  return ` WHERE ${clauses.join(" AND ")}`;
}

function buildOrder(
  definition: SqliteResourceDefinition,
  sort: readonly CrudSort[] | undefined,
): string {
  if (!sort?.length) return "";
  for (const item of sort) assertColumn(definition, item.field);
  return ` ORDER BY ${sort.map((item) => `${item.field} ${item.direction.toUpperCase()}`).join(", ")}`;
}

function insert(
  database: Database.Database,
  definition: SqliteResourceDefinition,
  values: Record<string, JsonValue>,
): void {
  const columns = Object.keys(values);
  for (const column of columns) assertColumn(definition, column);
  const placeholders = columns.map(() => "?").join(", ");
  database
    .prepare(
      `INSERT INTO ${definition.table} (${columns.join(", ")}) VALUES (${placeholders})`,
    )
    .run(...columns.map((column) => toSql(values[column])));
}

function update(
  database: Database.Database,
  definition: SqliteResourceDefinition,
  id: string,
  values: Record<string, JsonValue>,
): void {
  const columns = Object.keys(values).filter((column) => column !== "id");
  for (const column of columns) assertColumn(definition, column);
  if (!columns.length) return;
  database
    .prepare(
      `UPDATE ${definition.table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
    )
    .run(...columns.map((column) => toSql(values[column])), id);
}

function validateResources(
  resources: Readonly<Record<string, SqliteResourceDefinition>>,
) {
  for (const [resource, definition] of Object.entries(resources)) {
    if (!IDENTIFIER.test(resource) || !IDENTIFIER.test(definition.table))
      throw new TypeError("Invalid SQLite identifier");
    for (const column of definition.columns)
      if (!IDENTIFIER.test(column))
        throw new TypeError("Invalid SQLite column");
    for (const column of definition.jsonColumns ?? [])
      assertColumn(definition, column);
  }
  return resources;
}

function getResource(
  resources: Readonly<Record<string, SqliteResourceDefinition>>,
  resource: string,
): SqliteResourceDefinition {
  const definition = resources[resource];
  if (!definition) throw new TypeError("Unknown resource");
  return definition;
}

function assertColumn(
  definition: SqliteResourceDefinition,
  column: string,
): void {
  if (!definition.columns.includes(column))
    throw new TypeError("Unknown column");
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new TypeError("CRUD values must be an object");
  return { ...(value as Readonly<Record<string, JsonValue>>) };
}

function readId(values: Record<string, JsonValue>): string | undefined {
  return typeof values.id === "string" ? values.id : undefined;
}

function toSql(value: JsonValue | undefined): unknown {
  return value !== null && typeof value === "object"
    ? JSON.stringify(value)
    : value;
}

function appendInFilter(
  filter: CrudFilter,
  clauses: string[],
  params: unknown[],
): void {
  if (!Array.isArray(filter.value) || filter.value.length === 0) {
    clauses.push("0 = 1");
    return;
  }
  const placeholders = filter.value.map(() => "?").join(", ");
  clauses.push(`${filter.field} IN (${placeholders})`);
  for (const value of filter.value) params.push(toSql(value));
}

function decodeRecord(
  row: unknown,
  definition: SqliteResourceDefinition,
): CrudRecord {
  const record = row as Record<string, JsonValue>;
  const decoded: Record<string, JsonValue> = { ...record };
  for (const column of definition.jsonColumns ?? []) {
    const value = record[column];
    if (typeof value === "string")
      decoded[column] = JSON.parse(value) as JsonValue;
  }
  return decoded as CrudRecord;
}
