import { describe, expect, it } from "vitest";
import { createFeatureCrudOperations } from "./crud-operations";
import type { FeatureResourceDefinition } from "./feature-definition";
import { validateFeatureValue } from "./value-schema";

const resource = {
  fields: {
    createdAt: {
      create: false,
      required: true,
      schema: { format: "date-time", type: "string" },
      update: false,
    },
    id: { required: true, schema: { minLength: 1, type: "string" } },
    note: { required: false, schema: { maxLength: 240, type: "string" } },
    status: {
      required: true,
      schema: { enum: ["draft", "paid"], type: "string" },
    },
  },
  id: "invoices",
} as const satisfies FeatureResourceDefinition;

const operations = createFeatureCrudOperations({
  auditPrefix: "invoice",
  readAccess: { mode: "authenticated", permissions: ["invoice:read"] },
  resource,
  writeAccess: { mode: "authenticated", permissions: ["invoice:write"] },
});

describe("generated feature CRUD operations", () => {
  it("generates a complete protected contract with stable methods", () => {
    expect(
      operations.map(({ handler, id, kind, method, resource: name }) => ({
        handler,
        id,
        kind,
        method,
        resource: name,
      })),
    ).toEqual([
      {
        handler: "crud.list",
        id: "list",
        kind: "query",
        method: "POST",
        resource: "invoices",
      },
      {
        handler: "crud.get",
        id: "get",
        kind: "query",
        method: "POST",
        resource: "invoices",
      },
      {
        handler: "crud.create",
        id: "create",
        kind: "mutation",
        method: "POST",
        resource: "invoices",
      },
      {
        handler: "crud.update",
        id: "update",
        kind: "mutation",
        method: "PATCH",
        resource: "invoices",
      },
      {
        handler: "crud.delete",
        id: "delete",
        kind: "mutation",
        method: "DELETE",
        resource: "invoices",
      },
    ]);
    expect(operation("list").access).toEqual({
      mode: "authenticated",
      permissions: ["invoice:read"],
    });
    expect(operation("create")).toMatchObject({
      access: { mode: "authenticated", permissions: ["invoice:write"] },
      audit: { event: "invoice.create", required: true },
      idempotency: { required: true },
    });
  });

  it("constrains list filters and sorting to declared fields", () => {
    const input = operation("list").input;
    expect(
      validateFeatureValue(input, {
        filters: [{ field: "status", operator: "eq", value: "paid" }],
        limit: 25,
        offset: 0,
        sort: [{ direction: "desc", field: "createdAt" }],
      }).success,
    ).toBe(true);
    expect(
      validateFeatureValue(input, {
        filters: [{ field: "tenantId", operator: "eq", value: "other" }],
        limit: 25,
        offset: 0,
      }).success,
    ).toBe(false);
  });

  it("requires creatable fields and excludes server-owned fields", () => {
    const input = operation("create").input;
    expect(
      validateFeatureValue(input, { values: { status: "draft" } }).success,
    ).toBe(true);
    expect(validateFeatureValue(input, { values: {} }).success).toBe(false);
    expect(
      validateFeatureValue(input, {
        values: { createdAt: "2026-08-27T10:00:00Z", status: "draft" },
      }).success,
    ).toBe(false);
    expect(
      validateFeatureValue(input, { values: { id: "forged", status: "draft" } })
        .success,
    ).toBe(false);
  });

  it("accepts partial updates but rejects immutable fields", () => {
    const input = operation("update").input;
    expect(
      validateFeatureValue(input, {
        id: "invoice-1",
        values: { note: "Paid by transfer" },
      }).success,
    ).toBe(true);
    expect(
      validateFeatureValue(input, {
        id: "invoice-1",
        values: { createdAt: "2026-08-27T10:00:00Z" },
      }).success,
    ).toBe(false);
  });

  it("validates generated get, delete and output schemas", () => {
    expect(
      validateFeatureValue(operation("get").input, { id: "invoice-1" }).success,
    ).toBe(true);
    expect(validateFeatureValue(operation("delete").input, {}).success).toBe(
      false,
    );
    expect(
      validateFeatureValue(operation("list").output, {
        records: [
          {
            createdAt: "2026-08-27T10:00:00Z",
            id: "invoice-1",
            status: "paid",
          },
        ],
        total: 1,
      }).success,
    ).toBe(true);
  });
});

function operation(id: "create" | "delete" | "get" | "list" | "update") {
  const found = operations.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing generated operation: ${id}`);
  return found;
}
