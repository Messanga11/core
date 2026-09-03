import { describe, expect, it } from "vitest";
import { createOpaqueSession } from "./session";

describe("opaque OIDC sessions", () => {
  it("returns the token once and persists only its digest", () => {
    const session = createOpaqueSession({
      absoluteTtlSeconds: 3_600,
      identity: {
        id: "actor_123" as never,
        issuer: "https://identity.example.com/",
        type: "human",
      },
      now: new Date("2026-09-03T12:00:00.000Z"),
    });

    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(session.record.expiresAt).toBe("2026-09-03T13:00:00.000Z");
    expect(session.record).not.toHaveProperty("token");
  });

  it("rejects unbounded session lifetimes", () => {
    expect(() =>
      createOpaqueSession({
        absoluteTtlSeconds: 31_536_001,
        identity: {
          id: "actor_123" as never,
          issuer: "https://identity.example.com/",
          type: "human",
        },
      }),
    ).toThrow("AUTHENTICATION_FAILED");
  });
});
