import { createHash } from "node:crypto";
import {
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  type OidcAuthorizationCodeConfig,
  type OidcIdTokenVerifierPort,
  type OidcServerTokens,
  type OidcTokenTransportPort,
} from "./authorization-code";
import type { NormalizedOidcIdentity, SessionStorePort } from "./index";
import { OidcError } from "./index";
import { createOpaqueSession } from "./session";

export interface OidcLoginTransaction {
  readonly codeVerifier: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly stateDigest: string;
  readonly tenantId: string;
}

export interface OidcLoginTransactionStorePort {
  consume(stateDigest: string): Promise<OidcLoginTransaction | undefined>;
  save(transaction: OidcLoginTransaction): Promise<void>;
}

export interface OidcTenantAccessPort {
  authorize(options: {
    readonly identityId: string;
    readonly tenantId: string;
  }): Promise<boolean>;
}

export interface OidcServerTokenVaultPort {
  save(
    options: OidcServerTokens & {
      readonly sessionId: string;
      readonly tenantId: string;
    },
  ): Promise<void>;
}

export interface OidcIdentityVerifierPort {
  verify(token: string): Promise<NormalizedOidcIdentity>;
}

export async function beginOidcLogin(options: {
  readonly config: OidcAuthorizationCodeConfig;
  readonly returnTo: string;
  readonly tenantId: string;
  readonly transactions: OidcLoginTransactionStorePort;
}): Promise<{ readonly state: string; readonly url: string }> {
  validateTenant(options.tenantId);
  validateReturnTo(options.returnTo);
  const request = createAuthorizationRequest(options.config);
  await options.transactions.save(
    Object.freeze({
      codeVerifier: request.codeVerifier,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      nonce: request.nonce,
      returnTo: options.returnTo,
      stateDigest: digest(request.state),
      tenantId: options.tenantId,
    }),
  );
  return Object.freeze({ state: request.state, url: request.url });
}

export async function completeOidcLogin(options: {
  readonly code: string;
  readonly config: OidcAuthorizationCodeConfig;
  readonly identityVerifier: OidcIdentityVerifierPort;
  readonly sessionStore: SessionStorePort;
  readonly state: string;
  readonly tenantAccess: OidcTenantAccessPort;
  readonly tokenVault: OidcServerTokenVaultPort;
  readonly transactions: OidcLoginTransactionStorePort;
  readonly transport: OidcTokenTransportPort;
  readonly verifier: OidcIdTokenVerifierPort;
}): Promise<{
  readonly returnTo: string;
  readonly sessionToken: string;
  readonly tenantId: string;
}> {
  const transaction = await options.transactions.consume(digest(options.state));
  if (!transaction || Date.parse(transaction.expiresAt) <= Date.now()) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
  const tokens = await exchangeAuthorizationCode({
    code: options.code,
    codeVerifier: transaction.codeVerifier,
    config: options.config,
    expectedNonce: transaction.nonce,
    transport: options.transport,
    verifier: options.verifier,
  });
  const identity = await options.identityVerifier.verify(tokens.idToken);
  const allowed = await options.tenantAccess.authorize({
    identityId: identity.id,
    tenantId: transaction.tenantId,
  });
  if (!allowed) throw new OidcError("AUTHENTICATION_FAILED");
  const session = createOpaqueSession({
    absoluteTtlSeconds: 28_800,
    identity,
    idleTtlSeconds: 1_800,
    tenantId: transaction.tenantId,
  });
  await options.sessionStore.create({
    record: session.record,
    tokenDigest: session.tokenDigest,
  });
  await options.tokenVault.save({
    ...tokens,
    sessionId: session.record.sessionId,
    tenantId: transaction.tenantId,
  });
  return Object.freeze({
    returnTo: transaction.returnTo,
    sessionToken: session.token,
    tenantId: transaction.tenantId,
  });
}

function digest(value: string): string {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value))
    throw new OidcError("AUTHENTICATION_FAILED");
  return createHash("sha256").update(value).digest("hex");
}

function validateTenant(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new OidcError("AUTHENTICATION_FAILED");
}

function validateReturnTo(value: string): void {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > 2_048
  ) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
}
