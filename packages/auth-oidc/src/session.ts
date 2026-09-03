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

export function createOpaqueSession(options: {
  readonly absoluteTtlSeconds: number;
  readonly identity: NormalizedOidcIdentity;
  readonly now?: Date;
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
  const token = randomBytes(32).toString("base64url");
  const tokenDigest = createHash("sha256")
    .update(token)
    .digest("hex") as SessionTokenDigest;
  const expiresAt = new Date(
    now.getTime() + options.absoluteTtlSeconds * 1_000,
  ).toISOString();
  return Object.freeze({
    record: Object.freeze({
      expiresAt,
      identity: options.identity,
      sessionId: randomUUID() as SessionId,
    }),
    token,
    tokenDigest,
  });
}
