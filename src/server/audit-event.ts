import type { AuthenticatedRequestContext } from "../security/context";
import type { CoreErrorCode } from "../security/errors";
import type { OperationName, Permission } from "../security/identifiers";
import type { AuditEvent } from "../security/ports";

interface CreateAuditEventOptions {
  readonly context: AuthenticatedRequestContext;
  readonly errorCode?: CoreErrorCode;
  readonly operation: OperationName;
  readonly outcome: AuditEvent["outcome"];
  readonly permission: Permission;
  readonly phase: AuditEvent["phase"];
  readonly timestamp: string;
}

export function createAuditEvent(options: CreateAuditEventOptions): AuditEvent {
  return Object.freeze({
    actorId: options.context.actor.id,
    ...(options.errorCode ? { errorCode: options.errorCode } : {}),
    operation: options.operation,
    outcome: options.outcome,
    permission: options.permission,
    phase: options.phase,
    requestId: options.context.requestId,
    ...(options.context.resource ? { resource: options.context.resource } : {}),
    tenantId: options.context.tenantId,
    timestamp: options.timestamp,
  });
}
