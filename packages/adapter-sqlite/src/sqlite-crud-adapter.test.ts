import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createSqliteCrudAdapter } from "./sqlite-crud-adapter";

function setup() {
  const database = new Database(":memory:");
  database.exec(
    "CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, metadata TEXT)",
  );
  return createSqliteCrudAdapter({
    database,
    resources: {
      profiles: {
        columns: ["id", "name", "status", "metadata"],
        jsonColumns: ["metadata"],
        table: "profiles",
      },
    },
  });
}

describe("SQLite CRUD adapter", () => {
  it("creates, filters and updates records with allowlisted fields", async () => {
    const port = setup();
    const created = await port.create({
      idempotencyKey: "one",
      resource: "profiles",
      values: {
        id: "p1",
        metadata: { locale: "fr" },
        name: "Paul",
        status: "active",
      },
    });
    expect(created.id).toBe("p1");
    expect(
      (await port.get({ id: "p1", resource: "profiles" }))?.metadata,
    ).toEqual({
      locale: "fr",
    });
    expect(
      (
        await port.list({
          filters: [{ field: "status", operator: "eq", value: "active" }],
          limit: 10,
          offset: 0,
          resource: "profiles",
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await port.list({
          filters: [
            { field: "status", operator: "in", value: ["active", "pending"] },
          ],
          limit: 10,
          offset: 0,
          resource: "profiles",
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await port.update({
          id: "p1",
          idempotencyKey: "two",
          resource: "profiles",
          values: { name: "Messanga" },
        })
      ).name,
    ).toBe("Messanga");
  });

  it("rejects unknown resources and columns", async () => {
    const port = setup();
    await expect(
      port.list({ limit: 10, offset: 0, resource: "secrets" }),
    ).rejects.toThrow("Unknown resource");
    await expect(
      port.list({
        filters: [{ field: "password", operator: "eq", value: "x" }],
        limit: 10,
        offset: 0,
        resource: "profiles",
      }),
    ).rejects.toThrow("Unknown column");
  });
});
