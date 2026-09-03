import { Pool } from "pg";
import {
  createPostgresFeatureResourceAdapter,
  type PostgresFeatureResourceDefinition,
} from "./feature-resource.js";
import { createPostgresOidcTenantAccess } from "./oidc-tenant-access.js";
import { createPostgresOidcTokenVault } from "./oidc-token-vault.js";
import { createPostgresOutbox } from "./outbox.js";
import { createPostgresSessionStore } from "./session-store.js";
import type { SqlPoolPort } from "./sql.js";
import { createPostgresTenancyUnitOfWork } from "./unit-of-work.js";

export * from "./feature-resource.js";

export * from "./migrations.js";
export * from "./oidc-tenant-access.js";
export * from "./oidc-token-vault.js";
export * from "./outbox.js";
export * from "./outbox-worker.js";
export * from "./session-store.js";
export * from "./sql.js";
export * from "./unit-of-work.js";

export interface PostgresAdapterOptions {
  readonly connectionString: string;
  readonly featureResources?: Readonly<
    Record<string, PostgresFeatureResourceDefinition>
  >;
  readonly maxConnections?: number;
  readonly oidcTokenEncryptionKey?: string;
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
    oidcTenantAccess: createPostgresOidcTenantAccess(pool),
    ...(options.oidcTokenEncryptionKey
      ? {
          oidcTokenVault: createPostgresOidcTokenVault({
            encryptionKey: options.oidcTokenEncryptionKey,
            pool,
          }),
        }
      : {}),
    sessions: createPostgresSessionStore(pool),
    tenancy: createPostgresTenancyUnitOfWork(pool),
  };
}
