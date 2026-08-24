import { describe, expect, it, vi } from "vitest";

import { OidcError } from "./index";
import {
  createOidcTokenVerifier,
  type TokenClaimsVerifierPort,
} from "./server";

const BASE_CONFIG = {
  algorithms: ["RS256"] as const,
  audience: "messanga-app",
  clockToleranceSeconds: 30,
  issuer: "https://identity.example.com",
  jwksUri: "https://identity.example.com/.well-known/jwks.json",
};

describe("createOidcTokenVerifier", () => {
  it("normalizes verified claims without returning the token or raw claims", async () => {
    const claimsVerifier: TokenClaimsVerifierPort = {
      verify: vi.fn().mockResolvedValue({
        aud: "messanga-app",
        exp: 4_102_444_800,
        identity_kind: "service",
        iss: "https://identity.example.com/",
        sub: "service_123",
        tenant_id: "tenant_from_token",
      }),
    };
    const verifier = createOidcTokenVerifier(BASE_CONFIG, claimsVerifier);

    const identity = await verifier.verify("header.payload.signature");

    expect(identity).toEqual({
      id: "service_123",
      issuer: "https://identity.example.com/",
      type: "service",
    });
    expect(identity).not.toHaveProperty("token");
    expect(identity).not.toHaveProperty("claims");
    expect(identity).not.toHaveProperty("tenantId");
  });

  it("accepts an allowlisted audience array and a valid not-before claim", async () => {
    const verifier = createOidcTokenVerifier(
      { ...BASE_CONFIG, audience: ["web", "mobile"] },
      {
        verify: vi.fn().mockResolvedValue({
          aud: ["other", "mobile"],
          exp: 4_102_444_800,
          identity_kind: "human",
          iss: "https://identity.example.com/",
          nbf: 1,
          sub: "actor_123",
        }),
      },
    );

    await expect(
      verifier.verify("header.payload.signature"),
    ).resolves.toMatchObject({ id: "actor_123", type: "human" });
  });

  it.each([
    [
      "missing subject",
      {
        aud: "messanga-app",
        exp: 4_102_444_800,
        identity_kind: "human",
        iss: BASE_CONFIG.issuer,
      },
    ],
    [
      "unknown identity kind",
      {
        aud: "messanga-app",
        exp: 4_102_444_800,
        identity_kind: "admin",
        iss: BASE_CONFIG.issuer,
        sub: "actor_1",
      },
    ],
    [
      "wrong issuer",
      {
        aud: "messanga-app",
        exp: 4_102_444_800,
        identity_kind: "human",
        iss: "https://attacker.example",
        sub: "actor_1",
      },
    ],
    [
      "expired token",
      {
        aud: "messanga-app",
        exp: 1,
        identity_kind: "human",
        iss: BASE_CONFIG.issuer,
        sub: "actor_1",
      },
    ],
    [
      "wrong audience",
      {
        aud: "another-app",
        exp: 4_102_444_800,
        identity_kind: "human",
        iss: BASE_CONFIG.issuer,
        sub: "actor_1",
      },
    ],
    [
      "future not-before",
      {
        aud: "messanga-app",
        exp: 4_102_444_800,
        identity_kind: "human",
        iss: BASE_CONFIG.issuer,
        nbf: 4_102_444_800,
        sub: "actor_1",
      },
    ],
    [
      "missing expiration",
      {
        aud: "messanga-app",
        identity_kind: "human",
        iss: BASE_CONFIG.issuer,
        sub: "actor_1",
      },
    ],
  ])("fails closed for %s", async (_label, claims) => {
    const verifier = createOidcTokenVerifier(BASE_CONFIG, {
      verify: vi.fn().mockResolvedValue(claims),
    });

    await expect(
      verifier.verify("header.payload.signature"),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
  });

  it("maps a verification dependency failure to an opaque availability error", async () => {
    const verifier = createOidcTokenVerifier(BASE_CONFIG, {
      verify: vi.fn().mockRejectedValue(new Error("private network detail")),
    });

    await expect(verifier.verify("header.payload.signature")).rejects.toEqual(
      expect.objectContaining<Partial<OidcError>>({
        code: "SERVICE_UNAVAILABLE",
        message: "SERVICE_UNAVAILABLE",
      }),
    );
  });

  it("preserves an authentication rejection from the token verifier", async () => {
    const verifier = createOidcTokenVerifier(BASE_CONFIG, {
      verify: vi.fn().mockRejectedValue(new OidcError("AUTHENTICATION_FAILED")),
    });

    await expect(
      verifier.verify("header.payload.signature"),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
  });

  it.each(["", "not-a-jwt", `${"a".repeat(16_385)}.b.c`])(
    "rejects malformed tokens before calling the dependency",
    async (token) => {
      const verify = vi.fn();
      const verifier = createOidcTokenVerifier(BASE_CONFIG, { verify });

      await expect(verifier.verify(token)).rejects.toMatchObject({
        code: "AUTHENTICATION_FAILED",
      });
      expect(verify).not.toHaveBeenCalled();
    },
  );

  it("rejects symmetric and empty algorithm allowlists", () => {
    expect(() =>
      createOidcTokenVerifier(
        { ...BASE_CONFIG, algorithms: ["HS256"] },
        { verify: vi.fn() },
      ),
    ).toThrowError(OidcError);
    expect(() =>
      createOidcTokenVerifier(
        { ...BASE_CONFIG, algorithms: [] },
        { verify: vi.fn() },
      ),
    ).toThrowError(OidcError);
  });

  it("bounds clock tolerance", () => {
    expect(() =>
      createOidcTokenVerifier(
        { ...BASE_CONFIG, clockToleranceSeconds: 301 },
        { verify: vi.fn() },
      ),
    ).toThrowError(OidcError);
  });
});
