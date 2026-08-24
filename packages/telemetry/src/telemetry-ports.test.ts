import {
  type AuditEvent,
  OperationNameSchema,
  RequestIdSchema,
} from "@messanga11/core/server";
import { metrics, trace } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import {
  createTelemetryReporter,
  instrumentAuditPort,
} from "./telemetry-ports";

describe("telemetry ports", () => {
  it("reports opaque internal failures without recording the error value", async () => {
    const end = vi.fn();
    const startSpan = vi.fn(() => ({ end, setStatus: vi.fn() }));
    vi.spyOn(trace, "getTracer").mockReturnValue({ startSpan } as never);

    const reporter = createTelemetryReporter();
    await reporter.report({
      error: new Error("token=secret"),
      operation: OperationNameSchema.parse("project.rename"),
      requestId: RequestIdSchema.parse("request:test"),
      stage: "handler",
    });

    expect(startSpan).toHaveBeenCalledWith(
      "core.internal_error",
      expect.not.objectContaining({ error: expect.anything() }),
    );
    expect(end).toHaveBeenCalledOnce();
  });

  it("records only coarse audit dimensions after durable audit succeeds", async () => {
    const add = vi.fn();
    vi.spyOn(metrics, "getMeter").mockReturnValue({
      createCounter: () => ({ add }),
    } as never);
    const record = vi.fn(async () => undefined);
    const port = instrumentAuditPort({ record });
    const event = {
      actorId: "actor:test",
      operation: "project.rename",
      outcome: "succeeded",
      permission: "project:rename",
      phase: "result",
      requestId: "request:test",
      tenantId: "tenant:test",
      timestamp: "2026-08-24T00:00:00.000Z",
    } as AuditEvent;

    await port.record(event);

    expect(record).toHaveBeenCalledWith(event);
    expect(add).toHaveBeenCalledWith(1, {
      "core.error_code": "none",
      "core.operation": "project.rename",
      "core.outcome": "succeeded",
      "core.phase": "result",
    });
  });

  it("keeps telemetry silent when durable audit fails", async () => {
    const add = vi.fn();
    vi.spyOn(metrics, "getMeter").mockReturnValue({
      createCounter: () => ({ add }),
    } as never);
    const port = instrumentAuditPort({
      record: async () => {
        throw new Error("audit unavailable");
      },
    });

    await expect(
      port.record({
        actorId: "actor:test",
        operation: "project.rename",
        outcome: "failed",
        permission: "project:rename",
        phase: "result",
        requestId: "request:test",
        tenantId: "tenant:test",
        timestamp: "2026-08-24T00:00:00.000Z",
      } as AuditEvent),
    ).rejects.toThrow("audit unavailable");
    expect(add).not.toHaveBeenCalled();
  });
});
