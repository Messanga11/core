import type { TenantId } from "@messanga11/tenancy";
import type { ClaimedOutboxMessage, PostgresOutbox } from "./outbox.js";

export interface OutboxBatchResult {
  readonly failed: number;
  readonly published: number;
}

export async function processOutboxBatch(options: {
  readonly batchSize?: number;
  readonly maxAttempts?: number;
  readonly outbox: PostgresOutbox;
  readonly publish: (message: ClaimedOutboxMessage) => Promise<void>;
  readonly random?: () => number;
  readonly tenants: readonly TenantId[];
  readonly workerId: string;
}): Promise<OutboxBatchResult> {
  const batchSize = bounded(options.batchSize ?? 50, 1, 100);
  const maxAttempts = bounded(options.maxAttempts ?? 10, 1, 100);
  const random = options.random ?? Math.random;
  let failed = 0;
  let published = 0;
  for (const tenantId of options.tenants) {
    const messages = await options.outbox.claim({
      limit: batchSize,
      tenantId,
      workerId: options.workerId,
    });
    const acknowledged: number[] = [];
    for (const message of messages) {
      try {
        await options.publish(message);
        acknowledged.push(message.sequence);
        published += 1;
      } catch {
        failed += 1;
        await options.outbox.markFailed({
          failureCode: "DELIVERY_FAILED",
          retryAfterMs: retryDelay(message.attempts, random),
          sequence: message.sequence,
          tenantId,
          terminal: message.attempts >= maxAttempts,
          workerId: options.workerId,
        });
      }
    }
    if (acknowledged.length > 0) {
      await options.outbox.markPublished({
        sequences: acknowledged,
        tenantId,
        workerId: options.workerId,
      });
    }
  }
  return Object.freeze({ failed, published });
}

function retryDelay(attempt: number, random: () => number): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.min(attempt, 6));
  const jitter = Math.max(0, Math.min(1, random()));
  return Math.round(base * (0.5 + jitter));
}

function bounded(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError("Outbox worker configuration is invalid.");
  }
  return value;
}
