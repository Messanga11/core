import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJoseOidcIdTokenVerifier,
  createJoseOidcTokenVerifier,
} from "./jose-adapter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createJoseOidcTokenVerifier", () => {
  it("verifies a signed token and caches the remote JWKS", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    const fetchJwks = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          keys: [{ ...publicJwk, alg: "RS256", kid: "key-1", use: "sig" }],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchJwks);
    const token = await new SignJWT({
      identity_kind: "human",
    })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer("https://identity.example.com/")
      .setAudience("messanga-app")
      .setSubject("actor_123")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const verifier = createJoseOidcTokenVerifier({
      algorithms: ["RS256"],
      audience: "messanga-app",
      issuer: "https://identity.example.com",
      jwksUri: "https://identity.example.com/.well-known/jwks.json",
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      id: "actor_123",
      type: "human",
    });
    await verifier.verify(token);

    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  it("returns an authentication rejection for an invalid signature", async () => {
    const trusted = await generateKeyPair("RS256");
    const attacker = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(trusted.publicKey);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            keys: [{ ...publicJwk, alg: "RS256", kid: "key-1", use: "sig" }],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );
    const token = await new SignJWT({ identity_kind: "human" })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer("https://identity.example.com/")
      .setAudience("messanga-app")
      .setSubject("actor_123")
      .setExpirationTime("5m")
      .sign(attacker.privateKey);
    const verifier = createJoseOidcTokenVerifier({
      algorithms: ["RS256"],
      audience: "messanga-app",
      issuer: "https://identity.example.com",
      jwksUri: "https://identity.example.com/.well-known/jwks.json",
    });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      message: "AUTHENTICATION_FAILED",
    });
  });

  it("fails closed with availability when the JWKS endpoint is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network detail")),
    );
    const { privateKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ identity_kind: "human" })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer("https://identity.example.com/")
      .setAudience("mobile")
      .setSubject("actor_123")
      .setExpirationTime("5m")
      .sign(privateKey);
    const verifier = createJoseOidcTokenVerifier({
      algorithms: ["RS256"],
      audience: ["web", "mobile"],
      issuer: "https://identity.example.com",
      jwksUri: "https://identity.example.com/.well-known/jwks.json",
    });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "SERVICE_UNAVAILABLE",
    });
  });
});

describe("createJoseOidcIdTokenVerifier", () => {
  it("validates the callback nonce after signature and claim verification", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            keys: [{ ...publicJwk, alg: "RS256", kid: "key-1", use: "sig" }],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );
    const token = await new SignJWT({ nonce: "nonce-value-00001" })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer("https://identity.example.com/")
      .setAudience("messanga-app")
      .setSubject("actor_123")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const verifier = createJoseOidcIdTokenVerifier({
      algorithms: ["RS256"],
      audience: "messanga-app",
      issuer: "https://identity.example.com",
      jwksUri: "https://identity.example.com/.well-known/jwks.json",
    });

    await expect(
      verifier.verifyIdToken({ expectedNonce: "nonce-value-00001", token }),
    ).resolves.toBeUndefined();
    await expect(
      verifier.verifyIdToken({ expectedNonce: "attacker-nonce-01", token }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });
});
