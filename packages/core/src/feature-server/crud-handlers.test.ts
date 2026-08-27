import { describe, expect, it, vi } from "vitest";
import type { CrudPort } from "../crud";
import { createFeatureCrudHandlers } from "./crud-handlers";
import type { FeatureOperationInvocation } from "./feature-runtime";

const list = vi.fn<CrudPort["list"]>(async () => ({ records: [], total: 0 }));
const port: CrudPort = {
  create: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list,
  update: vi.fn(),
};

describe("feature CRUD handlers", () => {
  it("derives the storage resource from the declared feature operation", async () => {
    const handlers = createFeatureCrudHandlers(port);
    const handler = handlers["crud.list"];
    expect(handler).toBeDefined();
    await handler?.(invocation({ limit: 25, offset: 0, resource: "secrets" }));

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "orders.orders" }),
    );
  });
});

function invocation(
  input: FeatureOperationInvocation["input"],
): FeatureOperationInvocation {
  return {
    context: { permissions: new Set(), requestId: "request-1" },
    featureId: "orders",
    input,
    operation: {
      access: { mode: "public" },
      handler: "crud.list",
      id: "list",
      input: { properties: {}, type: "object" },
      kind: "query",
      method: "POST",
      output: { properties: {}, type: "object" },
      rateLimit: { cost: 1, limit: 10, windowMs: 60_000 },
      resource: "orders",
    },
    operationId: "list",
  };
}
