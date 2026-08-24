import { describe, expect, it } from "vitest";

import { createDomainEvent } from "./index";

describe("domain events", () => {
  it("creates a versioned event that round-trips through JSON", () => {
    const event = createDomainEvent({
      actor: { id: "actor-1", type: "human" },
      aggregate: { id: "project-1", type: "project", version: 3 },
      correlationId: "request-1",
      id: "event-1",
      occurredAt: "2026-08-24T12:00:00.000Z",
      payload: { name: "Roadmap", tags: ["priority"] },
      schemaVersion: 1,
      tenantId: "tenant-1",
      type: "project.renamed",
    });

    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it.each([Number.NaN, { value: undefined }, new Date()])(
    "rejects a non-JSON payload %#",
    (payload) => {
      expect(() =>
        createDomainEvent({
          actor: { id: "service-1", type: "service" },
          aggregate: { id: "project-1", type: "project", version: 1 },
          correlationId: "request-1",
          id: "event-1",
          occurredAt: "2026-08-24T12:00:00.000Z",
          payload: payload as never,
          schemaVersion: 1,
          tenantId: "tenant-1",
          type: "project.created",
        }),
      ).toThrow(TypeError);
    },
  );
});
