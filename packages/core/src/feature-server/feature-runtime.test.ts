import { describe, expect, it, vi } from "vitest";
import {
  compileFeatureCatalog,
  type FeatureCatalogDefinition,
} from "../features";
import { executeFeatureOperation, type FeatureBackendPorts } from ".";

const definition: FeatureCatalogDefinition = {
  application: {
    defaultLocale: "fr",
    description: "Runtime test",
    name: "Runtime",
    shortName: "Runtime",
  },
  features: [
    {
      blocks: [],
      id: "orders",
      operations: [
        {
          access: { mode: "authenticated", permissions: ["orders:create"] },
          audit: { event: "order.created", required: true },
          handler: "orders.create",
          id: "create",
          idempotency: { required: true },
          input: {
            properties: {
              quantity: { maximum: 10, minimum: 1, type: "number" },
            },
            required: ["quantity"],
            type: "object",
          },
          kind: "mutation",
          method: "POST",
          output: {
            properties: { accepted: { type: "boolean" } },
            required: ["accepted"],
            type: "object",
          },
          rateLimit: { cost: 1, limit: 5, windowMs: 60_000 },
        },
      ],
      pages: [],
      schemaVersion: 1,
      version: "1.0.0",
    },
  ],
  schemaVersion: 1,
};

function createPorts(
  overrides: Partial<FeatureBackendPorts> = {},
): FeatureBackendPorts {
  return {
    audit: vi.fn(async () => undefined),
    authorize: vi.fn(async ({ context, operation }) =>
      operation.access.mode === "authenticated"
        ? operation.access.permissions.every((permission: string) =>
            context.permissions.has(permission),
          )
        : true,
    ),
    handlers: { "orders.create": vi.fn(async () => ({ accepted: true })) },
    rateLimit: vi.fn(async () => ({ allowed: true })),
    ...overrides,
  };
}

const catalog = compileFeatureCatalog(definition);
const context = {
  actorId: "actor-1",
  permissions: new Set(["orders:create"]),
  requestId: "request-1",
  tenantId: "tenant-1",
};

describe("feature backend runtime", () => {
  it("executes a declared operation through every guard", async () => {
    const ports = createPorts();
    const result = await executeFeatureOperation({
      catalog,
      context,
      featureId: "orders",
      idempotencyKey: "idempotency-key-1",
      input: { quantity: 2 },
      method: "POST",
      operationId: "create",
      ports,
    });

    expect(result).toEqual({ data: { accepted: true }, status: "success" });
    expect(ports.authorize).toHaveBeenCalledOnce();
    expect(ports.rateLimit).toHaveBeenCalledOnce();
    expect(ports.audit).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["unknown operation", { operationId: "delete" }, "NOT_FOUND"],
    ["wrong method", { method: "GET" }, "METHOD_NOT_ALLOWED"],
    [
      "missing identity",
      {
        context: {
          permissions: context.permissions,
          requestId: context.requestId,
          tenantId: context.tenantId,
        },
      },
      "UNAUTHENTICATED",
    ],
    ["invalid input", { input: { quantity: 50 } }, "INVALID_INPUT"],
    ["missing idempotency", { idempotencyKey: "" }, "IDEMPOTENCY_REQUIRED"],
  ])("fails closed for %s", async (_label, overrides, code) => {
    const ports = createPorts();
    const result = await executeFeatureOperation({
      catalog,
      context,
      featureId: "orders",
      idempotencyKey: "idempotency-key-1",
      input: { quantity: 2 },
      method: "POST",
      operationId: "create",
      ports,
      ...overrides,
    });
    expect(result).toEqual(expect.objectContaining({ code, status: "error" }));
    expect(ports.handlers["orders.create"]).not.toHaveBeenCalled();
  });

  it("denies unavailable authorization and rate limit dependencies", async () => {
    const authorize = createPorts({
      authorize: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(
      await executeFeatureOperation({
        catalog,
        context,
        featureId: "orders",
        idempotencyKey: "idempotency-key-1",
        input: { quantity: 2 },
        method: "POST",
        operationId: "create",
        ports: authorize,
      }),
    ).toEqual(expect.objectContaining({ code: "FORBIDDEN" }));

    const rateLimit = createPorts({
      rateLimit: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(
      await executeFeatureOperation({
        catalog,
        context,
        featureId: "orders",
        idempotencyKey: "idempotency-key-1",
        input: { quantity: 2 },
        method: "POST",
        operationId: "create",
        ports: rateLimit,
      }),
    ).toEqual(expect.objectContaining({ code: "INTERNAL" }));
  });

  it("enforces declared permissions before the authorization adapter", async () => {
    const ports = createPorts({ authorize: vi.fn(async () => true) });
    const result = await executeFeatureOperation({
      catalog,
      context: { ...context, permissions: new Set() },
      featureId: "orders",
      idempotencyKey: "idempotency-key-1",
      input: { quantity: 2 },
      method: "POST",
      operationId: "create",
      ports,
    });
    expect(result).toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(ports.authorize).not.toHaveBeenCalled();
    expect(ports.handlers["orders.create"]).not.toHaveBeenCalled();
  });

  it("returns rate limit metadata without calling the handler", async () => {
    const ports = createPorts({
      rateLimit: vi.fn(async () => ({ allowed: false, retryAfterMs: 2_000 })),
    });
    const result = await executeFeatureOperation({
      catalog,
      context,
      featureId: "orders",
      idempotencyKey: "idempotency-key-1",
      input: { quantity: 2 },
      method: "POST",
      operationId: "create",
      ports,
    });
    expect(result).toEqual(
      expect.objectContaining({ code: "RATE_LIMITED", retryAfterMs: 2_000 }),
    );
    expect(ports.handlers["orders.create"]).not.toHaveBeenCalled();
  });

  it.each([
    ["missing handler", createPorts({ handlers: {} })],
    [
      "invalid handler output",
      createPorts({
        handlers: { "orders.create": vi.fn(async () => ({ accepted: "yes" })) },
      }),
    ],
    [
      "handler failure",
      createPorts({
        handlers: {
          "orders.create": vi.fn(async () => {
            throw new Error("failed");
          }),
        },
      }),
    ],
  ])("returns an opaque internal error for %s", async (_label, ports) => {
    const result = await executeFeatureOperation({
      catalog,
      context,
      featureId: "orders",
      idempotencyKey: "idempotency-key-1",
      input: { quantity: 2 },
      method: "POST",
      operationId: "create",
      ports,
    });
    expect(result).toEqual({
      code: "INTERNAL",
      requestId: "request-1",
      status: "error",
    });
  });
});
