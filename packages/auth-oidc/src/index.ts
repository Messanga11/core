import { type ActorId, ActorIdSchema } from "@messanga11/core/server";
import { z } from "zod";

const IdentityKindSchema = z.enum(["human", "service"]);
const ExternalIdentitySchema = z
  .object({
    issuer: z.url(),
    kind: IdentityKindSchema,
    subject: z.string().min(1).max(128),
  })
  .strict();

export type IdentityKind = z.infer<typeof IdentityKindSchema>;

export interface NormalizedOidcIdentity {
  readonly id: ActorId;
  readonly issuer: string;
  readonly type: IdentityKind;
}

export type OidcErrorCode = "AUTHENTICATION_FAILED" | "SERVICE_UNAVAILABLE";

export class OidcError extends Error {
  readonly code: OidcErrorCode;

  constructor(code: OidcErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "OidcError";
    this.code = code;
  }
}

export interface PublicOidcError {
  readonly code: OidcErrorCode;
  readonly message: string;
}

export type SessionId = string & { readonly __sessionId: unique symbol };
export type SessionTokenDigest = string & {
  readonly __sessionTokenDigest: unique symbol;
};

export interface SessionRecord {
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly identity: NormalizedOidcIdentity;
  readonly idleExpiresAt: string;
  readonly sessionId: SessionId;
  readonly tenantId: string;
}

export interface SessionStorePort {
  create(options: {
    readonly record: SessionRecord;
    readonly tokenDigest: SessionTokenDigest;
  }): Promise<void>;
  resolve(options: {
    readonly tenantId: string;
    readonly tokenDigest: SessionTokenDigest;
  }): Promise<SessionRecord | undefined>;
  revoke(options: {
    readonly sessionId: SessionId;
    readonly tenantId: string;
  }): Promise<void>;
}

export function normalizeOidcIdentity(value: unknown): NormalizedOidcIdentity {
  const result = ExternalIdentitySchema.safeParse(value);
  if (!result.success) {
    throw new OidcError("AUTHENTICATION_FAILED", result.error);
  }

  try {
    const issuer = new URL(result.data.issuer).href;
    const id = ActorIdSchema.parse(result.data.subject);
    return Object.freeze({
      id,
      issuer,
      type: result.data.kind,
    });
  } catch (error) {
    throw new OidcError("AUTHENTICATION_FAILED", error);
  }
}

export function toPublicOidcError(error: unknown): PublicOidcError {
  const code =
    error instanceof OidcError ? error.code : "AUTHENTICATION_FAILED";

  return Object.freeze({
    code,
    message:
      code === "SERVICE_UNAVAILABLE"
        ? "Authentication is temporarily unavailable."
        : "Authentication failed.",
  });
}
