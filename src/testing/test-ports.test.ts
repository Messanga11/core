import { describe, expect, it, vi } from "vitest";

import { OperationNameSchema, PermissionSchema } from "../security";
import { createTestContext, createTestPorts } from "./test-ports";

const OPERATION = OperationNameSchema.parse("profile.read");
const PERMISSION = PermissionSchema.parse("profile.read");

describe("testing ports", () => {
  it("provides deterministic allow-all adapters and observable state", async () => {
    const { ports, state } = createTestPorts();
    const context = createTestContext();
    const quota = await ports.quota.reserve({
      context,
      operation: OPERATION,
    });

    expect(
      await ports.authorization.authorize({
        context,
        permission: PERMISSION,
      }),
    ).toEqual({ allowed: true });
    expect(
      await ports.rateLimit.consume({
        context,
        operation: OPERATION,
      }),
    ).toEqual({ allowed: true });
    expect(quota.allowed).toBe(true);
    if (!quota.allowed) {
      return;
    }

    await quota.reservation.commit();
    await quota.reservation.release();
    expect(state).toMatchObject({
      committedReservations: 1,
      releasedReservations: 1,
    });
  });

  it("records audit events and internal reports without logging them", async () => {
    const { ports, state } = createTestPorts();
    const context = createTestContext();
    const event = {
      actorId: context.actor.id,
      operation: OPERATION,
      outcome: "succeeded" as const,
      permission: PERMISSION,
      phase: "result" as const,
      requestId: context.requestId,
      tenantId: context.tenantId,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const error = new Error("internal only");

    await ports.audit.record(event);
    await ports.reporter.report({
      error,
      operation: OPERATION,
      stage: "handler",
    });

    expect(state.auditEvents).toEqual([event]);
    expect(state.reportedErrors).toEqual([error]);
  });

  it("lets a test replace one port without rebuilding the others", async () => {
    const authorize = vi.fn(() => Promise.resolve({ allowed: false as const }));
    const { ports } = createTestPorts({ authorization: { authorize } });
    const context = createTestContext({
      resource: { id: "profile:1", type: "profile" },
    });

    await expect(
      ports.authorization.authorize({
        context,
        permission: PERMISSION,
      }),
    ).resolves.toEqual({ allowed: false });
    expect(authorize).toHaveBeenCalledOnce();
  });
});
