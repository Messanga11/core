import { createRemoteJWKSet, jwtVerify } from "jose";

import { OidcError } from "./index";
import {
  createOidcTokenVerifier,
  type OidcTokenVerifier,
  type OidcVerifierConfig,
  type TokenClaimsVerifierPort,
} from "./server";

const AUTHENTICATION_ERROR_CODES = new Set([
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWKS_INVALID",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_EXPIRED",
  "ERR_JWT_INVALID",
]);

function isAuthenticationFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return (
    typeof error.code === "string" && AUTHENTICATION_ERROR_CODES.has(error.code)
  );
}

export function createJoseOidcTokenVerifier(
  config: OidcVerifierConfig,
): OidcTokenVerifier {
  let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  const claimsVerifier: TokenClaimsVerifierPort = {
    async verify(options) {
      try {
        remoteJwks ??= createRemoteJWKSet(new URL(config.jwksUri));
        const audience: string | string[] =
          typeof options.audience === "string"
            ? options.audience
            : Array.from(options.audience);
        const result = await jwtVerify(options.token, remoteJwks, {
          algorithms: [...options.algorithms],
          audience,
          clockTolerance: options.clockToleranceSeconds,
          issuer: options.issuer,
        });
        return Object.freeze({ ...result.payload });
      } catch (error) {
        if (isAuthenticationFailure(error)) {
          throw new OidcError("AUTHENTICATION_FAILED", error);
        }
        throw error;
      }
    },
  };

  return createOidcTokenVerifier(config, claimsVerifier);
}
