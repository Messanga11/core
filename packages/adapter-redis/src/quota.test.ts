import {
  ActorIdSchema,
  OperationNameSchema,
  RequestIdSchema,
  TenantIdSchema,
} from "@messanga11/core/server";
import { describe, expect, it, vi } from "vitest";

import { createRedisQuotaPort } from "./quota";
import type { AtomicFunctionTransport } from "./transport";

const context = {
  actor: { id: ActorIdSchema.parse("actor_123"), type: "human" as const },
  requestId: RequestIdSchema.parse("request_123"),
  tenantId: TenantIdSchema.parse("tenant_123"),
};
const operation = OperationNameSchema.parse("project.create");

function createTransport(results: readonly unknown[]): AtomicFunctionTransport {
  const call = vi.fn();
  for (const result of results) {
    call.mockResolvedValueOnce(result);
  }
  return { call, load: vi.fn().mockResolvedValue(undefined) };
}

describe("createRedisQuotaPort", () => {
  it("returns a reservation that can be committed atomically", async () => {
    const transport = createTransport([[1], 1]);
    const port = createRedisQuotaPort({
      limit: 100,
      namespace: "billing",
      reservationTtlMs: 30_000,
      transport,
    });

    const decision = await port.reserve({ context, operation });

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) {
      throw new Error("Expected an allowed quota reservation");
    }
    await expect(decision.reservation.commit()).resolves.toBeUndefined();
    expect(transport.call).toHaveBeenNthCalledWith(
      2,
      "m11_quota_commit_v1",
      [expect.stringMatching(/^billing:quota-reservation:[a-f0-9]{64}$/)],
      [],
    );
  });

  it("releases a pending reservation with its exact cost", async () => {
    const transport = createTransport([[1], 1]);
    const port = createRedisQuotaPort({
      cost: 3,
      limit: 100,
      namespace: "billing",
      reservationTtlMs: 30_000,
      transport,
    });
    const decision = await port.reserve({ context, operation });
    if (!decision.allowed) {
      throw new Error("Expected an allowed quota reservation");
    }

    await decision.reservation.release();

    expect(transport.call).toHaveBeenNthCalledWith(
      2,
      "m11_quota_release_v1",
      [
        expect.stringMatching(/^billing:quota:[a-f0-9]{64}$/),
        expect.stringMatching(/^billing:quota-reservation:[a-f0-9]{64}$/),
      ],
      ["3"],
    );
  });

  it.each([[0], null, ["1"], new Error("network detail")])(
    "fails closed when reserve returns %p",
    async (result) => {
      const transport = createTransport([result]);
      if (result instanceof Error) {
        vi.mocked(transport.call).mockReset().mockRejectedValue(result);
      }
      const port = createRedisQuotaPort({
        limit: 100,
        namespace: "billing",
        reservationTtlMs: 30_000,
        transport,
      });

      await expect(port.reserve({ context, operation })).resolves.toEqual({
        allowed: false,
      });
    },
  );

  it("throws an opaque availability error when commit is not confirmed", async () => {
    const transport = createTransport([[1], 0]);
    const port = createRedisQuotaPort({
      limit: 100,
      namespace: "billing",
      reservationTtlMs: 30_000,
      transport,
    });
    const decision = await port.reserve({ context, operation });
    if (!decision.allowed) {
      throw new Error("Expected an allowed quota reservation");
    }

    await expect(decision.reservation.commit()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "SERVICE_UNAVAILABLE",
    });
  });

  it("wraps a commit transport failure without exposing its detail", async () => {
    const transport = createTransport([[1], 1]);
    vi.mocked(transport.call)
      .mockReset()
      .mockResolvedValueOnce([1])
      .mockRejectedValueOnce(new Error("private connection detail"));
    const port = createRedisQuotaPort({
      limit: 100,
      namespace: "billing",
      reservationTtlMs: 30_000,
      transport,
    });
    const decision = await port.reserve({ context, operation });
    if (!decision.allowed) {
      throw new Error("Expected an allowed quota reservation");
    }

    await expect(decision.reservation.commit()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "SERVICE_UNAVAILABLE",
    });
  });
});
