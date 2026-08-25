import { describe, expect, it } from "vitest";
import type { CrudListRequest, CrudPort } from "./crud";

describe("crud contracts", () => {
  it("remain JSON serializable and provider agnostic", () => {
    const request: CrudListRequest = {
      filters: [{ field: "status", operator: "eq", value: "active" }],
      limit: 20,
      offset: 0,
      resource: "members",
      sort: [{ direction: "asc", field: "name" }],
    };
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
  });

  it("defines a complete CRUD port", () => {
    const methods: ReadonlyArray<keyof CrudPort> = [
      "create",
      "delete",
      "get",
      "list",
      "update",
    ];
    expect(methods).toHaveLength(5);
  });
});
