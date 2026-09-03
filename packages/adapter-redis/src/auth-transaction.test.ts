import type { OidcLoginTransaction } from "@messanga11/auth-oidc/server";
import { describe, expect, it, vi } from "vitest";
import { createRedisOidcLoginTransactionStore } from "./auth-transaction";
import type { AtomicFunctionTransport } from "./transport";

const transaction: OidcLoginTransaction = {
  codeVerifier: "v".repeat(43),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  nonce: "n".repeat(43),
  returnTo: "/dashboard",
  stateDigest: "a".repeat(64),
  tenantId: "tenant-1",
};

describe("Redis OIDC login transaction store", () => {
  it("stores a bounded transaction and consumes it atomically once", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(JSON.stringify(transaction))
      .mockResolvedValueOnce(null);
    const transport: AtomicFunctionTransport = {
      call,
      load: vi.fn().mockResolvedValue(undefined),
    };
    const store = createRedisOidcLoginTransactionStore(transport);

    await store.save(transaction);
    await expect(store.consume("a".repeat(64))).resolves.toEqual(transaction);
    await expect(store.consume("a".repeat(64))).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledWith(
      "m11_auth_transaction_consume_v1",
      [`m11:auth:${"a".repeat(64)}`],
      [],
    );
  });

  it("fails closed for collisions and malformed Redis responses", async () => {
    const collision: AtomicFunctionTransport = {
      call: vi.fn().mockResolvedValue(0),
      load: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      createRedisOidcLoginTransactionStore(collision).save(transaction),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });

    const malformed: AtomicFunctionTransport = {
      call: vi.fn().mockResolvedValue("not-json"),
      load: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      createRedisOidcLoginTransactionStore(malformed).consume("a".repeat(64)),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
