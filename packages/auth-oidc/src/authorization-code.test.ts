import { describe, expect, it, vi } from "vitest";
import {
  createAuthorizationRequest,
  exchangeAuthorizationCode,
} from "./authorization-code";

const CONFIG = {
  authorizationEndpoint: "https://identity.example.com/authorize",
  clientId: "web-client",
  redirectUri: "https://app.example.com/api/auth/callback",
  scopes: ["openid", "profile"],
  tokenEndpoint: "https://identity.example.com/token",
} as const;

describe("OIDC authorization code with PKCE", () => {
  it("creates bounded state, nonce and an S256 challenge", () => {
    const request = createAuthorizationRequest(CONFIG);
    const url = new URL(request.url);

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(request.state);
    expect(url.searchParams.get("nonce")).toBe(request.nonce);
    expect(request.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(request.state).not.toBe(request.nonce);
  });

  it("exchanges a code without a browser-visible client secret and verifies nonce", async () => {
    const post = vi.fn().mockResolvedValue({
      access_token: "access-token",
      expires_in: 300,
      id_token: "header.payload.signature",
      refresh_token: "refresh-token",
      token_type: "Bearer",
    });
    const verifyIdToken = vi.fn().mockResolvedValue(undefined);

    await expect(
      exchangeAuthorizationCode({
        code: "authorization-code",
        codeVerifier: "v".repeat(43),
        config: CONFIG,
        expectedNonce: "nonce-value-00001",
        transport: { post },
        verifier: { verifyIdToken },
      }),
    ).resolves.toEqual({
      accessToken: "access-token",
      expiresInSeconds: 300,
      idToken: "header.payload.signature",
      refreshToken: "refresh-token",
    });
    expect(post).toHaveBeenCalledWith(
      CONFIG.tokenEndpoint,
      expect.stringContaining("code_verifier="),
    );
    expect(post.mock.calls[0]?.[1]).not.toContain("client_secret");
    expect(verifyIdToken).toHaveBeenCalledWith({
      expectedNonce: "nonce-value-00001",
      token: "header.payload.signature",
    });
  });

  it("fails closed before transport for malformed callback values", async () => {
    const post = vi.fn();
    await expect(
      exchangeAuthorizationCode({
        code: "",
        codeVerifier: "short",
        config: CONFIG,
        expectedNonce: "nonce",
        transport: { post },
        verifier: { verifyIdToken: vi.fn() },
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(post).not.toHaveBeenCalled();
  });
});
