import { describe, expect, it } from "vitest";

import { parseAuthenticatedRequestContext } from "./context";

describe("authenticated request context", () => {
  it("preserves a normalized service identity", () => {
    const context = parseAuthenticatedRequestContext({
      actor: { id: "service-1", type: "service" },
      requestId: "request-1",
      tenantId: "tenant-1",
    });

    expect(context.actor).toEqual({ id: "service-1", type: "service" });
  });

  it("rejects an actor without an identity type", () => {
    expect(() =>
      parseAuthenticatedRequestContext({
        actor: { id: "actor-1" },
        requestId: "request-1",
        tenantId: "tenant-1",
      }),
    ).toThrow();
  });
});
