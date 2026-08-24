import { createHash } from "node:crypto";
import type { SqlPoolPort } from "./sql.js";

export interface SqlMigration {
  readonly name: string;
  readonly sql: string;
  readonly version: number;
}

export async function runMigrations(
  pool: SqlPoolPort,
  migrations: readonly SqlMigration[],
): Promise<void> {
  validateMigrations(migrations);
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      "messanga11:migrations",
    ]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS messanga_migrations (version integer PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())",
    );
    const applied = await client.query<{ checksum: string; version: number }>(
      "SELECT version, checksum FROM messanga_migrations ORDER BY version",
    );
    const checksums = new Map(
      applied.rows.map((row) => [Number(row.version), row.checksum]),
    );
    for (const migration of migrations) {
      const checksum = createHash("sha256").update(migration.sql).digest("hex");
      const existing = checksums.get(migration.version);
      if (existing && existing !== checksum)
        throw new Error(`Migration ${migration.version} checksum mismatch.`);
      if (!existing) await applyMigration(client, migration, checksum);
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
        "messanga11:migrations",
      ]);
    } finally {
      client.release?.();
    }
  }
}

function validateMigrations(migrations: readonly SqlMigration[]) {
  let previous = 0;
  for (const migration of migrations) {
    if (
      !Number.isInteger(migration.version) ||
      migration.version <= previous ||
      !migration.name
    )
      throw new Error(
        "Migrations must have unique ascending positive versions.",
      );
    previous = migration.version;
  }
}

async function applyMigration(
  client: Awaited<ReturnType<SqlPoolPort["connect"]>>,
  migration: SqlMigration,
  checksum: string,
) {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO messanga_migrations (version, name, checksum) VALUES ($1, $2, $3)",
      [migration.version, migration.name, checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
