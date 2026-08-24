import { describe, expect, it } from "vitest";

import { normalizeOidcIdentity, OidcError, toPublicOidcError } from "./index";

describe("normalizeOidcIdentity", () => {
  it("normalizes an allowlisted human identity into core identifiers", () => {
    const identity = normalizeOidcIdentity({
      issuer: "https://identity.example.com",
      kind: "human",
      subject: "actor_123",
    });

    expect(identity).toEqual({
      id: "actor_123",
      issuer: "https://identity.example.com/",
      type: "human",
    });
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it("returns an opaque error for invalid external claims", () => {
    let failure: unknown;
    try {
      normalizeOidcIdentity({
        issuer: "not-a-url",
        kind: "administrator",
        subject: "actor_123",
      });
    } catch (error) {
      failure = error;
    }

    const publicError = toPublicOidcError(failure);

    expect(publicError).toEqual({
      code: "AUTHENTICATION_FAILED",
      message: "Authentication failed.",
    });
  });

  it("rejects a subject that cannot become a core actor identifier", () => {
    expect(() =>
      normalizeOidcIdentity({
        issuer: "https://identity.example.com",
        kind: "human",
        subject: "unsafe/actor",
      }),
    ).toThrowError("AUTHENTICATION_FAILED");
  });

  it("normalizes a service identity without tenant authority", () => {
    expect(
      normalizeOidcIdentity({
        issuer: "https://identity.example.com",
        kind: "service",
        subject: "service_123",
      }),
    ).toEqual({
      id: "service_123",
      issuer: "https://identity.example.com/",
      type: "service",
    });
  });

  it("publishes a generic availability message", () => {
    expect(toPublicOidcError(new OidcError("SERVICE_UNAVAILABLE"))).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "Authentication is temporarily unavailable.",
    });
  });
});
