import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  NormalizedOidcIdentity,
  SessionId,
  SessionRecord,
  SessionTokenDigest,
} from "./index";
import { OidcError } from "./index";

export interface NewOpaqueSession {
  readonly record: SessionRecord;
  readonly token: string;
  readonly tokenDigest: SessionTokenDigest;
}

export function digestSessionToken(token: string): SessionTokenDigest {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
  return createHash("sha256").update(token).digest("hex") as SessionTokenDigest;
}

export function createOpaqueSession(options: {
  readonly absoluteTtlSeconds: number;
  readonly identity: NormalizedOidcIdentity;
  readonly idleTtlSeconds?: number;
  readonly now?: Date;
  readonly tenantId: string;
}): NewOpaqueSession {
  if (
    !Number.isSafeInteger(options.absoluteTtlSeconds) ||
    options.absoluteTtlSeconds < 60 ||
    options.absoluteTtlSeconds > 31_536_000
  ) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new OidcError("AUTHENTICATION_FAILED");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(options.tenantId)) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
  const idleTtlSeconds = options.idleTtlSeconds ?? 1_800;
  if (
    !Number.isSafeInteger(idleTtlSeconds) ||
    idleTtlSeconds < 60 ||
    idleTtlSeconds > options.absoluteTtlSeconds
  ) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
  const token = randomBytes(32).toString("base64url");
  const tokenDigest = digestSessionToken(token);
  const expiresAt = new Date(
    now.getTime() + options.absoluteTtlSeconds * 1_000,
  ).toISOString();
  return Object.freeze({
    record: Object.freeze({
      createdAt: now.toISOString(),
      expiresAt,
      identity: options.identity,
      idleExpiresAt: new Date(
        now.getTime() + idleTtlSeconds * 1_000,
      ).toISOString(),
      sessionId: randomUUID() as SessionId,
      tenantId: options.tenantId,
    }),
    token,
    tokenDigest,
  });
}
