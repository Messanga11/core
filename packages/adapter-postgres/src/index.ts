import { Pool } from "pg";
import {
  createPostgresFeatureResourceAdapter,
  type PostgresFeatureResourceDefinition,
} from "./feature-resource.js";
import { createPostgresOutbox } from "./outbox.js";
import type { SqlPoolPort } from "./sql.js";
import { createPostgresTenancyUnitOfWork } from "./unit-of-work.js";

export * from "./feature-resource.js";

export * from "./migrations.js";
export * from "./outbox.js";
export * from "./outbox-worker.js";
export * from "./sql.js";
export * from "./unit-of-work.js";

export interface PostgresAdapterOptions {
  readonly connectionString: string;
  readonly featureResources?: Readonly<
    Record<string, PostgresFeatureResourceDefinition>
  >;
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
    features: createPostgresFeatureResourceAdapter({
      pool,
      resources: options.featureResources ?? {},
    }),
    outbox: createPostgresOutbox(pool),
    tenancy: createPostgresTenancyUnitOfWork(pool),
  };
}
