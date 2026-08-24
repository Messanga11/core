import {
  ActorIdSchema,
  OperationNameSchema,
  RequestIdSchema,
  TenantIdSchema,
} from "@messanga11/core/server";
import { describe, expect, it, vi } from "vitest";

import { createRedisRateLimitPort } from "./rate-limit";
import type { AtomicFunctionTransport } from "./transport";

const context = {
  actor: { id: ActorIdSchema.parse("actor_123"), type: "human" as const },
  requestId: RequestIdSchema.parse("request_123"),
  tenantId: TenantIdSchema.parse("tenant_123"),
};
const operation = OperationNameSchema.parse("project.rename");

function createTransport(result: unknown): AtomicFunctionTransport {
  return {
    call: vi.fn().mockResolvedValue(result),
    load: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createRedisRateLimitPort", () => {
  it("returns an allowed core decision for a valid atomic result", async () => {
    const transport = createTransport([1, 9, 0]);
    const port = createRedisRateLimitPort({
      cost: 1,
      limit: 10,
      namespace: "api",
      transport,
      windowMs: 60_000,
    });

    await expect(port.consume({ context, operation })).resolves.toEqual({
      allowed: true,
    });
    expect(transport.load).toHaveBeenCalledTimes(1);
    expect(transport.call).toHaveBeenCalledWith(
      "m11_rate_limit_v1",
      [expect.stringMatching(/^api:rate:[a-f0-9]{64}$/)],
      ["1", "10", "60000"],
    );
  });

  it.each([new Error("connection detail"), null, [], ["1", 9, 0], [2, 9, 0]])(
    "fails closed for dependency result %p",
    async (result) => {
      const transport = createTransport(result);
      if (result instanceof Error) {
        vi.mocked(transport.call).mockRejectedValue(result);
      }
      const port = createRedisRateLimitPort({
        limit: 10,
        namespace: "api",
        transport,
        windowMs: 60_000,
      });

      await expect(port.consume({ context, operation })).resolves.toEqual({
        allowed: false,
      });
    },
  );

  it("loads the function library once across calls", async () => {
    const transport = createTransport([1, 9, 0]);
    const port = createRedisRateLimitPort({
      limit: 10,
      namespace: "api",
      transport,
      windowMs: 60_000,
    });

    await port.consume({ context, operation });
    await port.consume({ context, operation });

    expect(transport.load).toHaveBeenCalledTimes(1);
  });

  it.each([
    { limit: 0, namespace: "api", windowMs: 1_000 },
    { limit: 10, namespace: "contains space", windowMs: 1_000 },
    { cost: 0, limit: 10, namespace: "api", windowMs: 1_000 },
    { limit: 10, namespace: "api", windowMs: 99 },
  ])("rejects invalid configuration %p", (invalid) => {
    expect(() =>
      createRedisRateLimitPort({
        ...invalid,
        transport: createTransport([1, 9, 0]),
      }),
    ).toThrowError("INVALID_CONFIGURATION");
  });
});
