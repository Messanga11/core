import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations.js";
import type { SqlPoolPort } from "./sql.js";

const connectionString = process.env.POSTGRES_INTEGRATION_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres("PostgreSQL 18 integration", () => {
  it("applies migrations twice and forces RLS on tenant tables", async () => {
    const pool = new Pool({ connectionString });
    const sql = await readFile(
      new URL("../migrations/001_tenancy_foundation.sql", import.meta.url),
      "utf8",
    );
    const resourcesSql = await readFile(
      new URL("../migrations/002_feature_resources.sql", import.meta.url),
      "utf8",
    );
    const deadLettersSql = await readFile(
      new URL("../migrations/003_outbox_dead_letters.sql", import.meta.url),
      "utf8",
    );
    const sessionsSql = await readFile(
      new URL("../migrations/004_oidc_sessions.sql", import.meta.url),
      "utf8",
    );
    const tokenVaultSql = await readFile(
      new URL("../migrations/005_oidc_token_vault.sql", import.meta.url),
      "utf8",
    );
    const migrations = [
      { name: "tenancy-foundation", sql, version: 1 },
      { name: "feature-resources", sql: resourcesSql, version: 2 },
      { name: "outbox-dead-letters", sql: deadLettersSql, version: 3 },
      { name: "oidc-sessions", sql: sessionsSql, version: 4 },
      { name: "oidc-token-vault", sql: tokenVaultSql, version: 5 },
    ] as const;

    try {
      await runMigrations(pool as unknown as SqlPoolPort, migrations);
      await runMigrations(pool as unknown as SqlPoolPort, migrations);
      const result = await pool.query<{
        relforcerowsecurity: boolean;
        relname: string;
      }>(
        "SELECT relname, relforcerowsecurity FROM pg_class WHERE relname = ANY($1::text[]) ORDER BY relname",
        [
          [
            "audit_events",
            "idempotency_keys",
            "invitations",
            "memberships",
            "messanga11_feature_idempotency",
            "messanga11_feature_records",
            "outbox",
            "outbox_dead_letters",
            "oidc_token_vault",
            "sessions",
            "tenants",
          ],
        ],
      );

      expect(result.rows).toHaveLength(11);
      expect(result.rows.every((row) => row.relforcerowsecurity)).toBe(true);
    } finally {
      await pool.end();
    }
  });
});
