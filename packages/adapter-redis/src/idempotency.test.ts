import { describe, expect, it, vi } from "vitest";

import {
  createRedisIdempotencyPort,
  type IdempotencyLease,
} from "./idempotency";
import type { AtomicFunctionTransport } from "./transport";

function createTransport(results: readonly unknown[]): AtomicFunctionTransport {
  const call = vi.fn();
  for (const result of results) {
    call.mockResolvedValueOnce(result);
  }
  return { call, load: vi.fn().mockResolvedValue(undefined) };
}

const request = {
  key: "550e8400-e29b-41d4-a716-446655440000",
  scope: "tenant_123:project.create",
  ttlMs: 60_000,
};

async function acquireLease(
  transport: AtomicFunctionTransport,
): Promise<IdempotencyLease> {
  const decision = await createRedisIdempotencyPort({
    namespace: "api",
    transport,
  }).acquire(request);
  if (!decision.acquired) {
    throw new Error("Expected an acquired lease");
  }
  return decision.lease;
}

describe("createRedisIdempotencyPort", () => {
  it("acquires a lease and stores a JSON-safe result atomically", async () => {
    const transport = createTransport([[1], 1]);
    const lease = await acquireLease(transport);

    await lease.complete({ projectId: "project_123", revision: 2 });

    expect(transport.call).toHaveBeenNthCalledWith(
      2,
      "m11_idempotency_complete_v1",
      [expect.stringMatching(/^api:idempotency:[a-f0-9]{64}$/)],
      [expect.any(String), '{"projectId":"project_123","revision":2}', "60000"],
    );
  });

  it("returns a replay value without invoking business logic", async () => {
    const transport = createTransport([
      [0, 'complete:{"projectId":"project_123"}'],
    ]);
    const port = createRedisIdempotencyPort({ namespace: "api", transport });

    await expect(port.acquire(request)).resolves.toEqual({
      acquired: false,
      state: "replay",
      value: { projectId: "project_123" },
    });
  });

  it("reports a currently pending operation without exposing its lease token", async () => {
    const transport = createTransport([[0, "pending:private-token"]]);
    const port = createRedisIdempotencyPort({ namespace: "api", transport });

    const decision = await port.acquire(request);

    expect(decision).toEqual({ acquired: false, state: "in_progress" });
    expect(JSON.stringify(decision)).not.toContain("private-token");
  });

  it.each([
    null,
    [],
    [2],
    [0, "complete:not-json"],
    [0, "unexpected:value"],
    new Error("connection detail"),
  ])("fails closed with an opaque error for %p", async (result) => {
    const transport = createTransport([result]);
    if (result instanceof Error) {
      vi.mocked(transport.call).mockReset().mockRejectedValue(result);
    }
    const port = createRedisIdempotencyPort({ namespace: "api", transport });

    await expect(port.acquire(request)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "SERVICE_UNAVAILABLE",
    });
  });

  it("rejects invalid TTL and unsafe keys before loading functions", async () => {
    const transport = createTransport([]);
    const port = createRedisIdempotencyPort({ namespace: "api", transport });

    await expect(
      port.acquire({ key: "unsafe key", scope: "tenant_123", ttlMs: 99 }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
    expect(transport.load).not.toHaveBeenCalled();
  });

  it("fails closed when a lease completion is not confirmed", async () => {
    const lease = await acquireLease(createTransport([[1], 0]));

    await expect(lease.complete({ ok: true })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("releases an acquired lease", async () => {
    const transport = createTransport([[1], 1]);
    const lease = await acquireLease(transport);

    await expect(lease.release()).resolves.toBeUndefined();
    expect(transport.call).toHaveBeenNthCalledWith(
      2,
      "m11_idempotency_release_v1",
      [expect.stringMatching(/^api:idempotency:[a-f0-9]{64}$/)],
      [expect.any(String)],
    );
  });

  it("rejects a non-JSON completion value before transport", async () => {
    const transport = createTransport([[1]]);
    const lease = await acquireLease(transport);

    await expect(
      lease.complete(undefined as unknown as never),
    ).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
    expect(transport.call).toHaveBeenCalledTimes(1);
  });

  it("replays primitive JSON values", async () => {
    const port = createRedisIdempotencyPort({
      namespace: "api",
      transport: createTransport([[0, "complete:true"]]),
    });

    await expect(port.acquire(request)).resolves.toEqual({
      acquired: false,
      state: "replay",
      value: true,
    });
  });
});
