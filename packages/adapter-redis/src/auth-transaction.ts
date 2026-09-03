import type {
  OidcLoginTransaction,
  OidcLoginTransactionStorePort,
} from "@messanga11/auth-oidc/server";
import { RedisAdapterError } from "./errors";
import {
  type AtomicFunctionTransport,
  createAtomicFunctionInvoker,
} from "./transport";

export function createRedisOidcLoginTransactionStore(
  transport: AtomicFunctionTransport,
): OidcLoginTransactionStorePort {
  const invoker = createAtomicFunctionInvoker(transport);
  return Object.freeze({
    consume: async (stateDigest: string) => {
      validateDigest(stateDigest);
      const result = await invoker.call(
        "m11_auth_transaction_consume_v1",
        [`m11:auth:${stateDigest}`],
        [],
      );
      if (result === null || result === false) return undefined;
      if (typeof result !== "string") throw unavailable();
      try {
        return validateTransaction(JSON.parse(result));
      } catch (error) {
        throw new RedisAdapterError("SERVICE_UNAVAILABLE", error);
      }
    },
    save: async (transaction: OidcLoginTransaction) => {
      const value = validateTransaction(transaction);
      const ttl = Date.parse(value.expiresAt) - Date.now();
      if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 600_000) {
        throw unavailable();
      }
      const result = await invoker.call(
        "m11_auth_transaction_save_v1",
        [`m11:auth:${value.stateDigest}`],
        [JSON.stringify(value), String(ttl)],
      );
      if (result !== 1) throw unavailable();
    },
  });
}

function validateTransaction(value: unknown): OidcLoginTransaction {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw unavailable();
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    typeof record.codeVerifier !== "string" ||
    record.codeVerifier.length < 43 ||
    typeof record.nonce !== "string" ||
    record.nonce.length < 16 ||
    typeof record.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(record.expiresAt)) ||
    typeof record.returnTo !== "string" ||
    !record.returnTo.startsWith("/") ||
    typeof record.stateDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.stateDigest) ||
    typeof record.tenantId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(record.tenantId)
  ) {
    throw unavailable();
  }
  return Object.freeze(record as unknown as OidcLoginTransaction);
}

function validateDigest(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw unavailable();
}

function unavailable(): RedisAdapterError {
  return new RedisAdapterError("SERVICE_UNAVAILABLE");
}
