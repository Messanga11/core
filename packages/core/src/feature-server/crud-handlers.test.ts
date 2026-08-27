import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../contracts";
import type { CrudPort } from "../crud";
import { createFeatureCrudHandlers } from "./crud-handlers";
import type { FeatureOperationInvocation } from "./feature-runtime";

describe("feature CRUD handlers", () => {
  it("derives list storage from the declaration and forwards query controls", async () => {
    const port = createPort();
    port.list.mockResolvedValue({ records: [{ id: "order-1" }], total: 1 });
    const handler = createFeatureCrudHandlers(port)["crud.list"];
    const input = {
      filters: [{ field: "status", operator: "eq", value: "paid" }],
      limit: 25,
      offset: 0,
      resource: "secrets",
      sort: [{ direction: "desc", field: "createdAt" }],
    } as const;

    await expect(handler?.(invocation(input))).resolves.toEqual({
      records: [{ id: "order-1" }],
      total: 1,
    });
    expect(port.list).toHaveBeenCalledWith({
      filters: input.filters,
      limit: 25,
      offset: 0,
      resource: "orders.orders",
      sort: input.sort,
    });
  });

  it("omits absent optional list controls", async () => {
    const port = createPort();
    const handler = createFeatureCrudHandlers(port)["crud.list"];
    await handler?.(invocation({ limit: 10, offset: 5 }));
    expect(port.list).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      resource: "orders.orders",
    });
  });

  it("gets existing and missing records without leaking adapter details", async () => {
    const port = createPort();
    const handler = createFeatureCrudHandlers(port)["crud.get"];
    port.get.mockResolvedValueOnce({ id: "order-1", status: "paid" });
    port.get.mockResolvedValueOnce(undefined);

    await expect(
      handler?.(invocation({ id: "order-1" }, "get")),
    ).resolves.toEqual({
      found: true,
      record: { id: "order-1", status: "paid" },
    });
    await expect(
      handler?.(invocation({ id: "missing" }, "get")),
    ).resolves.toEqual({
      found: false,
    });
  });

  it("creates and updates with the validated idempotency key", async () => {
    const port = createPort();
    const handlers = createFeatureCrudHandlers(port);
    port.create.mockResolvedValue({ id: "order-2", status: "draft" });
    port.update.mockResolvedValue({ id: "order-2", status: "paid" });

    await expect(
      handlers["crud.create"]?.(
        invocation(
          { values: { status: "draft" } },
          "create",
          "idem-create-0001",
        ),
      ),
    ).resolves.toEqual({ id: "order-2", status: "draft" });
    await expect(
      handlers["crud.update"]?.(
        invocation(
          { id: "order-2", values: { status: "paid" } },
          "update",
          "idem-update-0001",
        ),
      ),
    ).resolves.toEqual({ id: "order-2", status: "paid" });
    expect(port.create).toHaveBeenCalledWith({
      idempotencyKey: "idem-create-0001",
      resource: "orders.orders",
      values: { status: "draft" },
    });
    expect(port.update).toHaveBeenCalledWith({
      id: "order-2",
      idempotencyKey: "idem-update-0001",
      resource: "orders.orders",
      values: { status: "paid" },
    });
  });

  it("deletes only from the declared resource", async () => {
    const port = createPort();
    const handler = createFeatureCrudHandlers(port)["crud.delete"];
    await expect(
      handler?.(invocation({ id: "order-1" }, "delete")),
    ).resolves.toEqual({
      deleted: true,
    });
    expect(port.delete).toHaveBeenCalledWith({
      id: "order-1",
      resource: "orders.orders",
    });
  });

  it.each([
    ["non-object input", invocation(null), "Expected object"],
    ["invalid id", invocation({ id: 1 }, "get"), "Expected string"],
    [
      "invalid limit",
      invocation({ limit: "10", offset: 0 }),
      "Expected number",
    ],
    [
      "missing resource",
      invocation({ limit: 10, offset: 0 }, "list", undefined, false),
      "Missing resource",
    ],
    [
      "missing idempotency",
      invocation({ values: {} }, "create"),
      "Missing idempotency key",
    ],
  ])("rejects %s", async (_label, request, message) => {
    const port = createPort();
    await expect(
      createFeatureCrudHandlers(port)[request.operation.handler]?.(request),
    ).rejects.toThrow(message);
  });
});

function createPort() {
  return {
    create: vi.fn<CrudPort["create"]>(),
    delete: vi.fn<CrudPort["delete"]>(),
    get: vi.fn<CrudPort["get"]>(),
    list: vi.fn<CrudPort["list"]>(async () => ({ records: [], total: 0 })),
    update: vi.fn<CrudPort["update"]>(),
  };
}

function invocation(
  input: JsonValue,
  operationId: "create" | "delete" | "get" | "list" | "update" = "list",
  idempotencyKey?: string,
  hasResource = true,
): FeatureOperationInvocation {
  return {
    context: { permissions: new Set(), requestId: "request-1" },
    featureId: "orders",
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    input,
    operation: {
      access: { mode: "public" },
      handler: `crud.${operationId}`,
      id: operationId,
      input: { properties: {}, type: "object" },
      kind:
        operationId === "get" || operationId === "list" ? "query" : "mutation",
      method: "POST",
      output: { properties: {}, type: "object" },
      rateLimit: { cost: 1, limit: 10, windowMs: 60_000 },
      ...(hasResource ? { resource: "orders" } : {}),
    },
    operationId,
  };
}
