import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { runMigrations } from "./migrations.js";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

it("applies each migration once while holding an advisory lock", async () => {
  const calls: string[] = [];
  const sql = "CREATE TABLE example(id bigint PRIMARY KEY)";
  const checksum = createHash("sha256").update(sql).digest("hex");
  let alreadyApplied = false;
  const client: SqlClientPort = {
    async query<Row extends Record<string, unknown>>(text: string) {
      calls.push(text);
      const rows =
        text.startsWith("SELECT version") && alreadyApplied
          ? [{ version: 1, checksum }]
          : [];
      if (text.startsWith("INSERT INTO messanga_migrations"))
        alreadyApplied = true;
      return { rowCount: rows.length, rows: rows as unknown as Row[] };
    },
  };
  const pool: SqlPoolPort = {
    connect: async () => client,
    end: async () => undefined,
  };
  await runMigrations(pool, [{ name: "example", sql, version: 1 }]);
  await runMigrations(pool, [{ name: "example", sql, version: 1 }]);
  expect(calls.filter((text) => text === sql)).toHaveLength(1);
  expect(calls.some((text) => text.includes("pg_advisory_lock"))).toBe(true);
});

it("rejects invalid order and changed migration contents", async () => {
  const client: SqlClientPort = {
    async query<Row extends Record<string, unknown>>(text: string) {
      const rows = text.startsWith("SELECT version")
        ? [{ checksum: "different", version: 1 }]
        : [];
      return { rowCount: rows.length, rows: rows as unknown as Row[] };
    },
  };
  const pool: SqlPoolPort = {
    connect: async () => client,
    end: async () => undefined,
  };
  await expect(
    runMigrations(pool, [{ name: "invalid", sql: "SELECT 1", version: 0 }]),
  ).rejects.toThrow("ascending positive");
  await expect(
    runMigrations(pool, [{ name: "changed", sql: "SELECT 1", version: 1 }]),
  ).rejects.toThrow("checksum mismatch");
});
