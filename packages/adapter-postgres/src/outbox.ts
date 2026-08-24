import type { TenantId } from "@messanga11/tenancy";
import type { SqlPoolPort } from "./sql.js";

export interface ClaimedOutboxMessage {
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
}

export function createPostgresOutbox(pool: SqlPoolPort): PostgresOutbox {
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
          "WITH pending AS (SELECT sequence FROM outbox WHERE tenant_id = $1 AND published_at IS NULL AND available_at <= clock_timestamp() ORDER BY sequence FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE outbox AS item SET claimed_by = $3, claimed_at = clock_timestamp(), attempts = attempts + 1 FROM pending WHERE item.sequence = pending.sequence RETURNING item.sequence, item.event_id, item.event_type, item.payload",
          [options.tenantId, options.limit, options.workerId],
        );
        return result.rows.map((row) => ({
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
  };
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
