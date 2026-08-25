import type { CrudPort } from "@messanga11/core/crud";
import { describe, expect, it, vi } from "vitest";
import { createRefineDataProvider } from "./refine-data-provider";

function createPort(): CrudPort {
  return {
    create: vi.fn(async () => ({ id: "created", name: "Ada" })),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => ({ id: "one", name: "Ada" })),
    list: vi.fn(async () => ({
      records: [{ id: "one", name: "Ada" }],
      total: 1,
    })),
    update: vi.fn(async () => ({ id: "one", name: "Grace" })),
  };
}

describe("Refine DataProvider", () => {
  it("maps pagination, safe filters and sorting to the core port", async () => {
    const port = createPort();
    const provider = createRefineDataProvider(port);
    const result = await provider.getList({
      filters: [
        { field: "name", operator: "contains", value: "Ada" },
        { field: "name", operator: "ne", value: "ignored" },
      ],
      pagination: { currentPage: 2, pageSize: 10 },
      resource: "profiles",
      sorters: [{ field: "name", order: "asc" }],
    });
    expect(port.list).toHaveBeenCalledWith({
      filters: [{ field: "name", operator: "contains", value: "Ada" }],
      limit: 10,
      offset: 10,
      resource: "profiles",
      sort: [{ direction: "asc", field: "name" }],
    });
    expect(result.total).toBe(1);
  });

  it("maps missing records to a generic error", async () => {
    const port = createPort();
    port.get = vi.fn(async () => undefined);
    await expect(
      createRefineDataProvider(port).getOne({
        id: "missing",
        resource: "profiles",
      }),
    ).rejects.toThrow("Resource not found");
  });
});
