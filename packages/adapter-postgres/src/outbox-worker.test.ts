import type { TenantId } from "@messanga11/tenancy";
import { describe, expect, it, vi } from "vitest";
import type { PostgresOutbox } from "./outbox.js";
import { processOutboxBatch } from "./outbox-worker.js";

describe("outbox worker", () => {
  it("publishes and acknowledges a tenant-scoped batch", async () => {
    const outbox = createOutbox();
    const publish = vi.fn().mockResolvedValue(undefined);
    const result = await processOutboxBatch({
      outbox,
      publish,
      tenants: ["tenant-1" as TenantId],
      workerId: "worker-1",
    });

    expect(result).toEqual({ failed: 0, published: 1 });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "event-1" }),
    );
    expect(outbox.markPublished).toHaveBeenCalledWith({
      sequences: [1],
      tenantId: "tenant-1",
      workerId: "worker-1",
    });
  });

  it("reschedules failures with bounded jitter and dead-letters the last attempt", async () => {
    const outbox = createOutbox(10);
    const result = await processOutboxBatch({
      maxAttempts: 10,
      outbox,
      publish: vi.fn().mockRejectedValue(new Error("secret provider detail")),
      random: () => 0.5,
      tenants: ["tenant-1" as TenantId],
      workerId: "worker-1",
    });

    expect(result).toEqual({ failed: 1, published: 0 });
    expect(outbox.markFailed).toHaveBeenCalledWith({
      failureCode: "DELIVERY_FAILED",
      retryAfterMs: 60_000,
      sequence: 1,
      tenantId: "tenant-1",
      terminal: true,
      workerId: "worker-1",
    });
  });
});

function createOutbox(attempts = 1) {
  return {
    claim: vi.fn().mockResolvedValue([
      {
        attempts,
        eventId: "event-1",
        payload: {},
        sequence: 1,
        type: "orders.created.v1",
      },
    ]),
    markFailed: vi.fn(),
    markPublished: vi.fn(),
  } satisfies PostgresOutbox;
}
