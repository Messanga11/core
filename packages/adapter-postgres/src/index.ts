import { Pool } from "pg";
import { createPostgresOutbox } from "./outbox.js";
import type { SqlPoolPort } from "./sql.js";
import { createPostgresTenancyUnitOfWork } from "./unit-of-work.js";

export * from "./migrations.js";
export * from "./outbox.js";
export * from "./sql.js";
export * from "./unit-of-work.js";

export interface PostgresAdapterOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly statementTimeoutMs?: number;
}

export function createPostgresAdapter(options: PostgresAdapterOptions) {
  if (
    !options.connectionString.startsWith("postgres://") &&
    !options.connectionString.startsWith("postgresql://")
  )
    throw new TypeError("A PostgreSQL connection string is required.");
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    statement_timeout: options.statementTimeoutMs ?? 10_000,
  }) as unknown as SqlPoolPort;
  return {
    close: () => pool.end(),
    outbox: createPostgresOutbox(pool),
    tenancy: createPostgresTenancyUnitOfWork(pool),
  };
}
