import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createSqliteFeatureResourceAdapter } from "./sqlite-feature-resource-adapter";

function setup() {
  return createSqliteFeatureResourceAdapter({
    database: new Database(":memory:"),
    resources: {
      "orders.orders": {
        fields: ["id", "customer", "status", "total"],
        seed: [
          { id: "order-1", customer: "Ada", status: "pending", total: 25 },
        ],
      },
    },
  });
}

describe("SQLite feature resource adapter", () => {
  it("seeds, filters, sorts and paginates a declared resource", async () => {
    const port = setup();
    await port.create({
      idempotencyKey: "create-order-0001",
      resource: "orders.orders",
      values: { customer: "Grace", status: "ready", total: 50 },
    });
    const result = await port.list({
      filters: [{ field: "status", operator: "eq", value: "ready" }],
      limit: 10,
      offset: 0,
      resource: "orders.orders",
      sort: [{ direction: "desc", field: "total" }],
    });
    expect(result.total).toBe(1);
    expect(result.records[0]?.customer).toBe("Grace");
  });

  it("replays creates and updates by idempotency key", async () => {
    const port = setup();
    const request = {
      idempotencyKey: "create-order-0001",
      resource: "orders.orders",
      values: { customer: "Grace", status: "ready", total: 50 },
    } as const;
    const first = await port.create(request);
    const replay = await port.create({
      ...request,
      values: { ...request.values, total: 99 },
    });
    expect(replay).toEqual(first);
    expect(
      (await port.list({ limit: 10, offset: 0, resource: "orders.orders" }))
        .total,
    ).toBe(2);
  });

  it("rejects undeclared resources, fields and unsafe table names", async () => {
    const port = setup();
    await expect(
      port.list({ limit: 10, offset: 0, resource: "users" }),
    ).rejects.toThrow("Unknown resource");
    await expect(
      port.list({
        filters: [{ field: "password", operator: "eq", value: "secret" }],
        limit: 10,
        offset: 0,
        resource: "orders.orders",
      }),
    ).rejects.toThrow("Unknown field");
    expect(() =>
      createSqliteFeatureResourceAdapter({
        database: new Database(":memory:"),
        resources: {},
        table: "records; DROP TABLE records",
      }),
    ).toThrow("Invalid table");
  });
});
