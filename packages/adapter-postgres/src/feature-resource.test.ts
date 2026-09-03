import { describe, expect, it, vi } from "vitest";
import { createPostgresFeatureResourceAdapter } from "./feature-resource.js";
import type { SqlClientPort, SqlPoolPort, SqlResult } from "./sql.js";

const resources = {
  "orders.orders": {
    fields: {
      customer: "text",
      id: "text",
      status: "text",
      total: "number",
    },
  },
} as const;

describe("Postgres feature resource adapter", () => {
  it("rejects missing tenant and undeclared fields before querying", async () => {
    const harness = createHarness();
    const port = createPostgresFeatureResourceAdapter({
      pool: harness.pool,
      resources,
    });

    await expect(
      port.list({ limit: 10, offset: 0, resource: "orders.orders" }),
    ).rejects.toThrow("Tenant context is required");
    await expect(
      port.list({
        filters: [{ field: "tenantId", operator: "eq", value: "other" }],
        limit: 10,
        offset: 0,
        resource: "orders.orders",
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("Unknown field");
    expect(harness.connect).not.toHaveBeenCalled();
  });

  it("scopes reads by tenant and binds filter fields as parameters", async () => {
    const harness = createHarness((text) => {
      if (text.startsWith("SELECT data")) {
        return result([
          { data: { customer: "Ada", id: "order-1", total: 25 } },
        ]);
      }
      if (text.startsWith("SELECT count")) return result([{ count: "1" }]);
      return result([]);
    });
    const port = createPostgresFeatureResourceAdapter({
      pool: harness.pool,
      resources,
    });

    await expect(
      port.list({
        filters: [{ field: "customer", operator: "contains", value: "Ada" }],
        limit: 20,
        offset: 0,
        resource: "orders.orders",
        sort: [{ direction: "desc", field: "total" }],
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({
      records: [{ customer: "Ada", id: "order-1", total: 25 }],
      total: 1,
    });
    const listCall = harness.query.mock.calls.find(([text]) =>
      String(text).startsWith("SELECT data"),
    );
    expect(listCall?.[0]).not.toContain("customer");
    expect(listCall?.[0]).not.toContain("total");
    expect(listCall?.[1]).toEqual(
      expect.arrayContaining([
        "tenant-1",
        "orders.orders",
        "customer",
        "Ada",
        "total",
      ]),
    );
  });

  it("creates once and replays the stored result for an idempotency key", async () => {
    let replay: Readonly<Record<string, unknown>> | undefined;
    const harness = createHarness((text, values) => {
      if (text.startsWith("SELECT result")) {
        return result(replay ? [{ result: replay }] : []);
      }
      if (text.startsWith("INSERT INTO messanga11_feature_records")) {
        return result([{ data: values?.[3] }], 1);
      }
      if (text.startsWith("INSERT INTO messanga11_feature_idempotency")) {
        replay = values?.[4] as Readonly<Record<string, unknown>>;
      }
      return result([]);
    });
    const port = createPostgresFeatureResourceAdapter({
      pool: harness.pool,
      resources,
    });
    const request = {
      idempotencyKey: "idempotency-key-0001",
      resource: "orders.orders",
      tenantId: "tenant-1",
      values: { customer: "Ada", status: "pending", total: 25 },
    } as const;

    const first = await port.create(request);
    const second = await port.create(request);

    expect(second).toEqual(first);
    expect(
      harness.query.mock.calls.filter(([text]) =>
        String(text).startsWith("INSERT INTO messanga11_feature_records"),
      ),
    ).toHaveLength(1);
  });

  it("requires an expected version for update and delete", async () => {
    const harness = createHarness();
    const port = createPostgresFeatureResourceAdapter({
      pool: harness.pool,
      resources,
    });

    await expect(
      port.update({
        id: "order-1",
        idempotencyKey: "idempotency-key-0001",
        resource: "orders.orders",
        tenantId: "tenant-1",
        values: { status: "paid" },
      }),
    ).rejects.toThrow("Expected version is required");
    await expect(
      port.delete({
        id: "order-1",
        idempotencyKey: "idempotency-key-0002",
        resource: "orders.orders",
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("Expected version is required");
    expect(harness.connect).not.toHaveBeenCalled();
  });
});

function createHarness(
  respond: (
    text: string,
    values: readonly unknown[] | undefined,
  ) => SqlResult = () => result([]),
) {
  const queryMock = vi.fn(respond);
  const query: SqlClientPort["query"] = async <
    Row extends Record<string, unknown> = Record<string, unknown>,
  >(
    text: string,
    values?: readonly unknown[],
  ) => queryMock(text, values) as SqlResult<Row>;
  const client: SqlClientPort = { query, release: vi.fn() };
  const connect = vi.fn<SqlPoolPort["connect"]>(async () => client);
  return { connect, pool: { connect, end: vi.fn() }, query: queryMock };
}

function result(
  rows: readonly Record<string, unknown>[],
  rowCount = rows.length,
): SqlResult {
  return { rowCount, rows };
}
