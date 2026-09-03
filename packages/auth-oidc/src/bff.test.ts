import { describe, expect, it, vi } from "vitest";
import { beginOidcLogin, completeOidcLogin } from "./bff";
import type { SessionStorePort } from "./index";

const config = {
  authorizationEndpoint: "https://identity.example.com/authorize",
  clientId: "web-client",
  redirectUri: "https://app.example.com/api/auth/callback",
  scopes: ["openid", "profile"],
  tokenEndpoint: "https://identity.example.com/token",
} as const;

describe("OIDC BFF orchestration", () => {
  it("consumes one login transaction, verifies tenant membership and stores tokens server-side", async () => {
    let transaction:
      | Parameters<ReturnType<typeof transactionStore>["save"]>[0]
      | undefined;
    const transactions = transactionStore({
      read: () => transaction,
      write: (value) => {
        transaction = value;
      },
    });
    const started = await beginOidcLogin({
      config,
      returnTo: "/dashboard",
      tenantId: "tenant-1",
      transactions,
    });
    const sessionStore = sessionStoreMock();
    const saveTokens = vi.fn();
    const result = await completeOidcLogin({
      code: "authorization-code",
      config,
      identityVerifier: {
        verify: vi.fn().mockResolvedValue({
          id: "actor_1",
          issuer: "https://identity.example.com/",
          type: "human",
        }),
      },
      sessionStore,
      state: started.state,
      tenantAccess: { authorize: vi.fn().mockResolvedValue(true) },
      tokenVault: { save: saveTokens },
      transactions,
      transport: {
        post: vi.fn().mockResolvedValue({
          access_token: "access-token",
          expires_in: 300,
          id_token: "header.payload.signature",
          refresh_token: "refresh-token",
          token_type: "Bearer",
        }),
      },
      verifier: { verifyIdToken: vi.fn().mockResolvedValue(undefined) },
    });

    expect(result.returnTo).toBe("/dashboard");
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionStore.create).toHaveBeenCalledOnce();
    expect(saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        tenantId: "tenant-1",
      }),
    );
    await expect(
      completeOidcLogin({
        code: "authorization-code",
        config,
        identityVerifier: { verify: vi.fn() },
        sessionStore,
        state: started.state,
        tenantAccess: { authorize: vi.fn() },
        tokenVault: { save: vi.fn() },
        transactions,
        transport: { post: vi.fn() },
        verifier: { verifyIdToken: vi.fn() },
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("fails closed before session creation when tenant membership is absent", async () => {
    let transaction:
      | Parameters<ReturnType<typeof transactionStore>["save"]>[0]
      | undefined;
    const transactions = transactionStore({
      read: () => transaction,
      write: (value) => {
        transaction = value;
      },
    });
    const started = await beginOidcLogin({
      config,
      returnTo: "/",
      tenantId: "tenant-1",
      transactions,
    });
    const sessions = sessionStoreMock();
    await expect(
      completeOidcLogin({
        code: "authorization-code",
        config,
        identityVerifier: {
          verify: vi.fn().mockResolvedValue({
            id: "actor_1",
            issuer: "https://identity.example.com/",
            type: "human",
          }),
        },
        sessionStore: sessions,
        state: started.state,
        tenantAccess: { authorize: vi.fn().mockResolvedValue(false) },
        tokenVault: { save: vi.fn() },
        transactions,
        transport: {
          post: vi.fn().mockResolvedValue({
            access_token: "a",
            expires_in: 300,
            id_token: "a.b.c",
            token_type: "Bearer",
          }),
        },
        verifier: { verifyIdToken: vi.fn().mockResolvedValue(undefined) },
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(sessions.create).not.toHaveBeenCalled();
  });
});

function transactionStore(state: {
  read: () =>
    | Parameters<import("./bff").OidcLoginTransactionStorePort["save"]>[0]
    | undefined;
  write: (
    value:
      | Parameters<import("./bff").OidcLoginTransactionStorePort["save"]>[0]
      | undefined,
  ) => void;
}) {
  return {
    consume: vi.fn(async () => {
      const value = state.read();
      state.write(undefined);
      return value;
    }),
    save: vi.fn(async (value) => {
      state.write(value);
    }),
  } satisfies import("./bff").OidcLoginTransactionStorePort;
}

function sessionStoreMock() {
  return {
    create: vi.fn(),
    resolve: vi.fn(),
    revoke: vi.fn(),
  } satisfies SessionStorePort;
}
