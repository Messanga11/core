import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type {
  OidcServerTokens,
  OidcServerTokenVaultPort,
} from "@messanga11/auth-oidc/server";
import { z } from "zod";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

const TokensSchema = z.object({
  accessToken: z.string().min(1).max(16_384),
  expiresInSeconds: z.number().int().positive().max(31_536_000),
  idToken: z.string().min(1).max(32_768),
  refreshToken: z.string().min(1).max(16_384).optional(),
});

export interface PostgresOidcTokenVaultOptions {
  readonly encryptionKey: string;
  readonly pool: SqlPoolPort;
}

export interface PostgresOidcTokenVault extends OidcServerTokenVaultPort {
  resolve(options: {
    readonly sessionId: string;
    readonly tenantId: string;
  }): Promise<OidcServerTokens | undefined>;
  revoke(options: {
    readonly sessionId: string;
    readonly tenantId: string;
  }): Promise<void>;
}

export function createPostgresOidcTokenVault(
  options: PostgresOidcTokenVaultOptions,
): PostgresOidcTokenVault {
  const key = decodeKey(options.encryptionKey);
  return Object.freeze({
    resolve: async (identity: TokenIdentity) =>
      withTenant(options.pool, identity.tenantId, async (client) => {
        const result = await client.query<TokenRow>(
          "SELECT ciphertext, nonce, auth_tag FROM oidc_token_vault WHERE tenant_id = $1 AND session_id = $2",
          [identity.tenantId, identity.sessionId],
        );
        return result.rows[0] ? decryptTokens(result.rows[0], key) : undefined;
      }),
    revoke: async (identity: TokenIdentity) =>
      withTenant(options.pool, identity.tenantId, async (client) => {
        await client.query(
          "DELETE FROM oidc_token_vault WHERE tenant_id = $1 AND session_id = $2",
          [identity.tenantId, identity.sessionId],
        );
      }),
    save: async (tokens: Parameters<OidcServerTokenVaultPort["save"]>[0]) =>
      withTenant(options.pool, tokens.tenantId, async (client) => {
        const encrypted = encryptTokens(tokens, key);
        await client.query(
          "INSERT INTO oidc_token_vault (tenant_id, session_id, ciphertext, nonce, auth_tag, expires_at) VALUES ($1, $2, $3, $4, $5, clock_timestamp() + make_interval(secs => $6)) ON CONFLICT (tenant_id, session_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, nonce = EXCLUDED.nonce, auth_tag = EXCLUDED.auth_tag, expires_at = EXCLUDED.expires_at",
          [
            tokens.tenantId,
            tokens.sessionId,
            encrypted.ciphertext,
            encrypted.nonce,
            encrypted.authTag,
            tokens.expiresInSeconds,
          ],
        );
      }),
  });
}

interface TokenRow extends Record<string, unknown> {
  readonly auth_tag: unknown;
  readonly ciphertext: unknown;
  readonly nonce: unknown;
}

interface TokenIdentity {
  readonly sessionId: string;
  readonly tenantId: string;
}

function encryptTokens(
  tokens: OidcServerTokens,
  key: Buffer,
): {
  readonly authTag: Buffer;
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
} {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const plaintext = Buffer.from(
    JSON.stringify(TokensSchema.parse(tokens)),
    "utf8",
  );
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    authTag: cipher.getAuthTag(),
    ciphertext,
    nonce,
  };
}

function decryptTokens(row: TokenRow, key: Buffer): OidcServerTokens {
  const ciphertext = asBuffer(row.ciphertext);
  const nonce = asBuffer(row.nonce);
  const authTag = asBuffer(row.auth_tag);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  const parsed = TokensSchema.parse(JSON.parse(plaintext) as unknown);
  return Object.freeze({
    accessToken: parsed.accessToken,
    expiresInSeconds: parsed.expiresInSeconds,
    idToken: parsed.idToken,
    ...(parsed.refreshToken === undefined
      ? {}
      : { refreshToken: parsed.refreshToken }),
  });
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new TypeError(
      "OIDC token encryption key must be canonical base64 for 32-byte data.",
    );
  }
  return key;
}

function asBuffer(value: unknown): Buffer {
  if (!Buffer.isBuffer(value))
    throw new TypeError("Invalid encrypted token record.");
  return value;
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
      // Preserve the original transactional failure.
    }
    throw error;
  } finally {
    client.release?.();
  }
}
