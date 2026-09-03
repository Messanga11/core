import type { TenantId } from "@messanga11/tenancy";
import type { SqlPoolPort } from "./sql.js";

export interface ClaimedOutboxMessage {
  readonly attempts: number;
  readonly eventId: string;
  readonly payload: unknown;
  readonly sequence: number;
  readonly type: string;
}

export interface PostgresOutbox {
  claim(options: {
    tenantId: TenantId;
    workerId: string;
    limit: number;
  }): Promise<readonly ClaimedOutboxMessage[]>;
  markPublished(options: {
    tenantId: TenantId;
    workerId: string;
    sequences: readonly number[];
  }): Promise<void>;
  markFailed(options: {
    failureCode?: string;
    retryAfterMs: number;
    sequence: number;
    tenantId: TenantId;
    terminal: boolean;
    workerId: string;
  }): Promise<void>;
}

export function createPostgresOutbox(
  pool: SqlPoolPort,
  configuration: {
    readonly leaseMs?: number;
    readonly maxAttempts?: number;
  } = {},
): PostgresOutbox {
  const leaseMs = boundedInteger(
    configuration.leaseMs ?? 300_000,
    1_000,
    3_600_000,
  );
  const maxAttempts = boundedInteger(configuration.maxAttempts ?? 10, 1, 100);
  return {
    async claim(options) {
      if (
        !Number.isInteger(options.limit) ||
        options.limit < 1 ||
        options.limit > 100
      )
        throw new RangeError("limit must be between 1 and 100.");
      return withTenantClient(pool, options.tenantId, async (client) => {
        const result = await client.query(
          "WITH pending AS (SELECT sequence FROM outbox WHERE tenant_id = $1 AND published_at IS NULL AND available_at <= clock_timestamp() AND (claimed_at IS NULL OR claimed_at < clock_timestamp() - make_interval(secs => $4::double precision / 1000)) AND attempts < $5 ORDER BY sequence FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE outbox AS item SET claimed_by = $3, claimed_at = clock_timestamp(), attempts = attempts + 1 FROM pending WHERE item.sequence = pending.sequence RETURNING item.sequence, item.event_id, item.event_type, item.payload, item.attempts",
          [
            options.tenantId,
            options.limit,
            options.workerId,
            leaseMs,
            maxAttempts,
          ],
        );
        return result.rows.map((row) => ({
          attempts: Number(row.attempts),
          eventId: String(row.event_id),
          payload: row.payload,
          sequence: Number(row.sequence),
          type: String(row.event_type),
        }));
      });
    },
    async markPublished(options) {
      if (options.sequences.length === 0) return;
      await withTenantClient(pool, options.tenantId, async (client) => {
        await client.query(
          "UPDATE outbox SET published_at = clock_timestamp() WHERE tenant_id = $1 AND claimed_by = $2 AND sequence = ANY($3::bigint[]) AND published_at IS NULL",
          [options.tenantId, options.workerId, options.sequences],
        );
      });
    },
    async markFailed(options) {
      validateFailure(options);
      await withTenantClient(pool, options.tenantId, async (client) => {
        if (!options.terminal) {
          await client.query(
            "UPDATE outbox SET available_at = clock_timestamp() + make_interval(secs => $4::double precision / 1000), claimed_by = NULL, claimed_at = NULL WHERE tenant_id = $1 AND claimed_by = $2 AND sequence = $3 AND published_at IS NULL",
            [
              options.tenantId,
              options.workerId,
              options.sequence,
              options.retryAfterMs,
            ],
          );
          return;
        }
        await client.query(
          "INSERT INTO outbox_dead_letters (tenant_id, sequence, event_id, event_type, payload, occurred_at, attempts, failure_code) SELECT tenant_id, sequence, event_id, event_type, payload, occurred_at, attempts, $4 FROM outbox WHERE tenant_id = $1 AND claimed_by = $2 AND sequence = $3 AND published_at IS NULL",
          [
            options.tenantId,
            options.workerId,
            options.sequence,
            options.failureCode ?? "DELIVERY_FAILED",
          ],
        );
        await client.query(
          "DELETE FROM outbox WHERE tenant_id = $1 AND claimed_by = $2 AND sequence = $3 AND published_at IS NULL",
          [options.tenantId, options.workerId, options.sequence],
        );
      });
    },
  };
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError("Outbox configuration is invalid.");
  }
  return value;
}

function validateFailure(options: {
  readonly failureCode?: string;
  readonly retryAfterMs: number;
  readonly sequence: number;
}): void {
  boundedInteger(options.sequence, 1, Number.MAX_SAFE_INTEGER);
  boundedInteger(options.retryAfterMs, 0, 86_400_000);
  if (
    options.failureCode &&
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(options.failureCode)
  ) {
    throw new TypeError("Outbox failure code is invalid.");
  }
}

async function withTenantClient<T>(
  pool: SqlPoolPort,
  tenantId: TenantId,
  work: (client: Awaited<ReturnType<SqlPoolPort["connect"]>>) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      tenantId,
    ]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Preserve the original error. */
    }
    throw error;
  } finally {
    client.release?.();
  }
}
