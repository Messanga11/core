import type {
  SessionId,
  SessionRecord,
  SessionStorePort,
} from "@messanga11/auth-oidc";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

export function createPostgresSessionStore(
  pool: SqlPoolPort,
): SessionStorePort {
  return Object.freeze({
    create: async (options: Parameters<SessionStorePort["create"]>[0]) =>
      withTenant(pool, options.record.tenantId, async (client) => {
        await client.query(
          "INSERT INTO sessions (id, tenant_id, identity_id, identity_kind, identity_issuer, token_hash, created_at, idle_expires_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz)",
          [
            options.record.sessionId,
            options.record.tenantId,
            options.record.identity.id,
            options.record.identity.type,
            options.record.identity.issuer,
            options.tokenDigest,
            options.record.createdAt,
            options.record.idleExpiresAt,
            options.record.expiresAt,
          ],
        );
      }),
    resolve: async (options: Parameters<SessionStorePort["resolve"]>[0]) =>
      withTenant(pool, options.tenantId, async (client) => {
        const result = await client.query<SessionRow>(
          "SELECT id, tenant_id, identity_id, identity_kind, identity_issuer, created_at, idle_expires_at, expires_at FROM sessions WHERE tenant_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > clock_timestamp() AND idle_expires_at > clock_timestamp()",
          [options.tenantId, options.tokenDigest],
        );
        return result.rows[0] ? decodeSession(result.rows[0]) : undefined;
      }),
    revoke: async (options: Parameters<SessionStorePort["revoke"]>[0]) =>
      withTenant(pool, options.tenantId, async (client) => {
        await client.query(
          "UPDATE sessions SET revoked_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL",
          [options.tenantId, options.sessionId],
        );
      }),
  });
}

interface SessionRow extends Record<string, unknown> {
  readonly created_at: unknown;
  readonly expires_at: unknown;
  readonly id: unknown;
  readonly identity_id: unknown;
  readonly identity_issuer: unknown;
  readonly identity_kind: unknown;
  readonly idle_expires_at: unknown;
  readonly tenant_id: unknown;
}

function decodeSession(row: SessionRow): SessionRecord {
  if (
    typeof row.id !== "string" ||
    typeof row.tenant_id !== "string" ||
    typeof row.identity_id !== "string" ||
    typeof row.identity_issuer !== "string" ||
    (row.identity_kind !== "human" && row.identity_kind !== "service")
  )
    throw new TypeError("Invalid session record");
  return Object.freeze({
    createdAt: timestamp(row.created_at),
    expiresAt: timestamp(row.expires_at),
    identity: Object.freeze({
      id: row.identity_id as SessionRecord["identity"]["id"],
      issuer: row.identity_issuer,
      type: row.identity_kind,
    }),
    idleExpiresAt: timestamp(row.idle_expires_at),
    sessionId: row.id as SessionId,
    tenantId: row.tenant_id,
  });
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime()))
    throw new TypeError("Invalid session record");
  return date.toISOString();
}

async function withTenant<Result>(
  pool: SqlPoolPort,
  tenantId: string,
  work: (client: SqlClientPort) => Promise<Result>,
): Promise<Result> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId))
    throw new TypeError("Invalid tenant context");
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
      /* Preserve original failure. */
    }
    throw error;
  } finally {
    client.release?.();
  }
}
