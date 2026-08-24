import { z } from "zod";

import {
  type NormalizedOidcIdentity,
  normalizeOidcIdentity,
  OidcError,
} from "./index";

const ASYMMETRIC_ALGORITHMS = [
  "EdDSA",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
  "RS256",
  "RS384",
  "RS512",
] as const;

export type OidcAlgorithm = (typeof ASYMMETRIC_ALGORITHMS)[number];

const ClaimNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
const HttpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");
const ConfigSchema = z
  .object({
    algorithms: z.array(z.enum(ASYMMETRIC_ALGORITHMS)).min(1).max(10),
    audience: z.union([
      z.string().min(1).max(256),
      z.array(z.string().min(1).max(256)).min(1).max(10),
    ]),
    clockToleranceSeconds: z.number().int().min(0).max(300).default(30),
    identityKindClaim: ClaimNameSchema.default("identity_kind"),
    issuer: HttpsUrlSchema,
    jwksUri: HttpsUrlSchema,
  })
  .strict();

export interface OidcVerifierConfig {
  readonly algorithms: readonly string[];
  readonly audience: string | readonly string[];
  readonly clockToleranceSeconds?: number;
  readonly identityKindClaim?: string;
  readonly issuer: string;
  readonly jwksUri: string;
}

export interface VerifiedTokenClaims {
  readonly [claim: string]: unknown;
}

export interface TokenClaimsVerifierPort {
  verify(options: {
    readonly algorithms: readonly OidcAlgorithm[];
    readonly audience: string | readonly string[];
    readonly clockToleranceSeconds: number;
    readonly issuer: string;
    readonly token: string;
  }): Promise<VerifiedTokenClaims>;
}

export interface OidcTokenVerifier {
  verify(token: string): Promise<NormalizedOidcIdentity>;
}

function parseConfig(config: OidcVerifierConfig) {
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    throw new OidcError("AUTHENTICATION_FAILED", result.error);
  }

  return Object.freeze({
    ...result.data,
    audience: Array.isArray(result.data.audience)
      ? Object.freeze([...result.data.audience])
      : result.data.audience,
    issuer: new URL(result.data.issuer).href,
    jwksUri: new URL(result.data.jwksUri).href,
  });
}

function isCompactJwt(token: string): boolean {
  if (token.length < 5 || token.length > 16_384) {
    return false;
  }

  const segments = token.split(".");
  return (
    segments.length === 3 && segments.every((segment) => segment.length > 0)
  );
}

function hasAudience(
  actual: unknown,
  expected: string | readonly string[],
): boolean {
  const actualValues = Array.isArray(actual) ? actual : [actual];
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  return expectedValues.some((value) => actualValues.includes(value));
}

function validateTemporalClaims(
  claims: VerifiedTokenClaims,
  toleranceSeconds: number,
): boolean {
  const now = Math.floor(Date.now() / 1_000);
  if (typeof claims.exp !== "number" || claims.exp + toleranceSeconds < now) {
    return false;
  }

  return typeof claims.nbf !== "number" || claims.nbf - toleranceSeconds <= now;
}

export function createOidcTokenVerifier(
  untrustedConfig: OidcVerifierConfig,
  claimsVerifier: TokenClaimsVerifierPort,
): OidcTokenVerifier {
  const config = parseConfig(untrustedConfig);

  return Object.freeze({
    async verify(token: string): Promise<NormalizedOidcIdentity> {
      if (!isCompactJwt(token)) {
        throw new OidcError("AUTHENTICATION_FAILED");
      }

      let claims: VerifiedTokenClaims;
      try {
        claims = await claimsVerifier.verify({
          algorithms: config.algorithms,
          audience: config.audience,
          clockToleranceSeconds: config.clockToleranceSeconds,
          issuer: config.issuer,
          token,
        });
      } catch (error) {
        if (error instanceof OidcError) {
          throw error;
        }
        throw new OidcError("SERVICE_UNAVAILABLE", error);
      }

      if (
        claims.iss !== config.issuer ||
        !hasAudience(claims.aud, config.audience) ||
        !validateTemporalClaims(claims, config.clockToleranceSeconds)
      ) {
        throw new OidcError("AUTHENTICATION_FAILED");
      }

      return normalizeOidcIdentity({
        issuer: claims.iss,
        kind: claims[config.identityKindClaim],
        subject: claims.sub,
      });
    },
  });
}
