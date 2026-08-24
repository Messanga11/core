import type { AuthenticatedRequestContext } from "./context";
import type { CoreErrorCode } from "./errors";
import type {
  OperationName,
  Permission,
  ResourceReference,
} from "./identifiers";

export type AccessDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false }>;

export interface AuthorizationPort {
  authorize(options: {
    readonly context: AuthenticatedRequestContext;
    readonly permission: Permission;
  }): Promise<AccessDecision>;
}

export interface ResourceScopePort {
  authorize(options: {
    readonly context: AuthenticatedRequestContext;
    readonly resource: ResourceReference;
  }): Promise<AccessDecision>;
}

export interface QuotaReservation {
  commit(): Promise<void>;
  release(): Promise<void>;
}

export type QuotaDecision =
  | Readonly<{ allowed: true; reservation: QuotaReservation }>
  | Readonly<{ allowed: false }>;

export interface QuotaPort {
  reserve(options: {
    readonly context: AuthenticatedRequestContext;
    readonly operation: OperationName;
  }): Promise<QuotaDecision>;
}

export type RateLimitDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false }>;

export interface RateLimitPort {
  consume(options: {
    readonly context: AuthenticatedRequestContext;
    readonly operation: OperationName;
  }): Promise<RateLimitDecision>;
}

export type AuditPhase = "intent" | "result";
export type AuditOutcome = "attempted" | "succeeded" | "failed";

export interface AuditEvent {
  readonly actorId: AuthenticatedRequestContext["actor"]["id"];
  readonly errorCode?: CoreErrorCode;
  readonly operation: OperationName;
  readonly outcome: AuditOutcome;
  readonly permission: Permission;
  readonly phase: AuditPhase;
  readonly requestId: AuthenticatedRequestContext["requestId"];
  readonly resource?: ResourceReference;
  readonly tenantId: AuthenticatedRequestContext["tenantId"];
  readonly timestamp: string;
}

export interface AuditPort {
  record(event: AuditEvent): Promise<void>;
}

export interface InternalErrorReporterPort {
  report(options: {
    readonly error: unknown;
    readonly operation: OperationName;
    readonly requestId?: AuthenticatedRequestContext["requestId"];
    readonly stage: string;
  }): Promise<void> | void;
}

export interface ClockPort {
  now(): Date;
}

export interface ProtectedOperationPorts {
  readonly audit: AuditPort;
  readonly authorization: AuthorizationPort;
  readonly clock: ClockPort;
  readonly quota: QuotaPort;
  readonly rateLimit: RateLimitPort;
  readonly reporter: InternalErrorReporterPort;
}
