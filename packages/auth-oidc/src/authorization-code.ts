import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { OidcError } from "./index";

const HttpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");
const AuthorizationConfigSchema = z
  .object({
    authorizationEndpoint: HttpsUrl,
    clientId: z.string().min(1).max(256),
    redirectUri: HttpsUrl,
    scopes: z
      .array(z.string().regex(/^[A-Za-z][A-Za-z0-9:_-]{0,63}$/))
      .min(1)
      .max(20),
    tokenEndpoint: HttpsUrl,
  })
  .strict();

const TokenResponseSchema = z
  .object({
    access_token: z.string().min(1).max(16_384),
    expires_in: z.number().int().min(1).max(86_400),
    id_token: z.string().min(5).max(16_384),
    refresh_token: z.string().min(1).max(16_384).optional(),
    token_type: z.literal("Bearer"),
  })
  .strict();

export interface OidcAuthorizationCodeConfig {
  readonly authorizationEndpoint: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly tokenEndpoint: string;
}

export interface OidcAuthorizationRequest {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly state: string;
  readonly url: string;
}

export interface OidcTokenTransportPort {
  post(endpoint: string, formBody: string): Promise<unknown>;
}

export interface OidcIdTokenVerifierPort {
  verifyIdToken(options: {
    readonly expectedNonce: string;
    readonly token: string;
  }): Promise<void>;
}

export interface OidcServerTokens {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly idToken: string;
  readonly refreshToken?: string;
}

export function createAuthorizationRequest(
  untrustedConfig: OidcAuthorizationCodeConfig,
): OidcAuthorizationRequest {
  const config = parseConfig(untrustedConfig);
  const codeVerifier = randomValue();
  const state = randomValue();
  const nonce = randomValue();
  const challenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const url = new URL(config.authorizationEndpoint);
  const parameters = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    nonce,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });
  url.search = parameters.toString();
  return Object.freeze({ codeVerifier, nonce, state, url: url.href });
}

export async function exchangeAuthorizationCode(options: {
  readonly code: string;
  readonly codeVerifier: string;
  readonly config: OidcAuthorizationCodeConfig;
  readonly expectedNonce: string;
  readonly transport: OidcTokenTransportPort;
  readonly verifier: OidcIdTokenVerifierPort;
}): Promise<OidcServerTokens> {
  const config = parseConfig(options.config);
  validateCallback(options);
  const body = new URLSearchParams({
    client_id: config.clientId,
    code: options.code,
    code_verifier: options.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  }).toString();
  let untrustedResponse: unknown;
  try {
    untrustedResponse = await options.transport.post(
      config.tokenEndpoint,
      body,
    );
  } catch (error) {
    throw new OidcError("SERVICE_UNAVAILABLE", error);
  }
  const parsed = TokenResponseSchema.safeParse(untrustedResponse);
  if (!parsed.success)
    throw new OidcError("AUTHENTICATION_FAILED", parsed.error);
  await options.verifier.verifyIdToken({
    expectedNonce: options.expectedNonce,
    token: parsed.data.id_token,
  });
  return Object.freeze({
    accessToken: parsed.data.access_token,
    expiresInSeconds: parsed.data.expires_in,
    idToken: parsed.data.id_token,
    ...(parsed.data.refresh_token
      ? { refreshToken: parsed.data.refresh_token }
      : {}),
  });
}

function parseConfig(config: OidcAuthorizationCodeConfig) {
  const parsed = AuthorizationConfigSchema.safeParse(config);
  if (!parsed.success)
    throw new OidcError("AUTHENTICATION_FAILED", parsed.error);
  if (!parsed.data.scopes.includes("openid")) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
  return parsed.data;
}

function validateCallback(options: {
  readonly code: string;
  readonly codeVerifier: string;
  readonly expectedNonce: string;
}): void {
  if (
    options.code.length < 1 ||
    options.code.length > 4_096 ||
    options.codeVerifier.length < 43 ||
    options.codeVerifier.length > 128 ||
    options.expectedNonce.length < 16 ||
    options.expectedNonce.length > 128
  ) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
}

function randomValue(): string {
  return randomBytes(32).toString("base64url");
}
