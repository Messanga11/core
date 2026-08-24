import type {
  AuditEvent,
  AuditPort,
  InternalErrorReporterPort,
} from "@messanga11/core/server";
import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";

export interface TelemetryOptions {
  readonly instrumentationName?: string;
}

export function createTelemetryReporter(
  options: TelemetryOptions = {},
): InternalErrorReporterPort {
  const tracer = trace.getTracer(
    options.instrumentationName ?? "@messanga11/telemetry",
  );

  return {
    report(report) {
      const span = tracer.startSpan("core.internal_error", {
        attributes: {
          "core.operation": report.operation,
          "core.request_id": report.requestId ?? "unknown",
          "core.stage": report.stage,
        },
      });
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    },
  };
}

export function instrumentAuditPort(
  delegate: AuditPort,
  options: TelemetryOptions = {},
): AuditPort {
  const name = options.instrumentationName ?? "@messanga11/telemetry";
  const counter = metrics.getMeter(name).createCounter("core.audit_events");

  return {
    async record(event) {
      await delegate.record(event);
      counter.add(1, auditAttributes(event));
    },
  };
}

function auditAttributes(event: AuditEvent) {
  return {
    "core.error_code": event.errorCode ?? "none",
    "core.operation": event.operation,
    "core.outcome": event.outcome,
    "core.phase": event.phase,
  } as const;
}
