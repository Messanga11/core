import type { JsonValue } from "../contracts";
import type {
  CompiledFeatureCatalog,
  FeatureOperationDefinition,
} from "../features";
import { validateFeatureValue } from "../features";

export interface FeatureRequestContext {
  readonly actorId?: string;
  readonly permissions: ReadonlySet<string>;
  readonly rateLimitKey?: string;
  readonly requestId: string;
  readonly tenantId?: string;
}

export interface FeatureOperationInvocation {
  readonly context: FeatureRequestContext;
  readonly idempotencyKey?: string;
  readonly input: JsonValue;
  readonly operation: FeatureOperationDefinition;
}

export type FeatureOperationHandler = (
  invocation: FeatureOperationInvocation,
) => Promise<JsonValue>;

export interface FeatureBackendPorts {
  readonly audit: (event: {
    readonly actorId?: string;
    readonly event: string;
    readonly operation: string;
    readonly outcome: "denied" | "failed" | "started" | "succeeded";
    readonly requestId: string;
    readonly tenantId?: string;
  }) => Promise<void>;
  readonly authorize: (request: {
    readonly context: FeatureRequestContext;
    readonly operation: FeatureOperationDefinition;
  }) => Promise<boolean>;
  readonly handlers: Readonly<Record<string, FeatureOperationHandler>>;
  readonly rateLimit: (request: {
    readonly context: FeatureRequestContext;
    readonly operation: string;
    readonly policy: NonNullable<FeatureOperationDefinition["rateLimit"]>;
  }) => Promise<{ readonly allowed: boolean; readonly retryAfterMs?: number }>;
  readonly reportError?: (error: unknown, requestId: string) => void;
}

export type FeatureBackendResult =
  | { readonly data: JsonValue; readonly status: "success" }
  | {
      readonly code:
        | "FORBIDDEN"
        | "IDEMPOTENCY_REQUIRED"
        | "INTERNAL"
        | "INVALID_INPUT"
        | "METHOD_NOT_ALLOWED"
        | "NOT_FOUND"
        | "RATE_LIMITED"
        | "UNAUTHENTICATED";
      readonly issues?: readonly {
        readonly code: string;
        readonly path: readonly string[];
      }[];
      readonly requestId: string;
      readonly retryAfterMs?: number;
      readonly status: "error";
    };

export async function executeFeatureOperation(options: {
  readonly catalog: CompiledFeatureCatalog;
  readonly context: FeatureRequestContext;
  readonly featureId: string;
  readonly idempotencyKey?: string;
  readonly input: unknown;
  readonly method: string;
  readonly operationId: string;
  readonly ports: FeatureBackendPorts;
}): Promise<FeatureBackendResult> {
  const operationKey = `${options.featureId}.${options.operationId}`;
  const operation = options.catalog.operations[operationKey];
  if (!operation) return error("NOT_FOUND", options.context.requestId);
  if (options.method !== operation.method) {
    return error("METHOD_NOT_ALLOWED", options.context.requestId);
  }

  const accessError = await authorize(
    operation,
    options.context,
    options.ports,
  );
  if (accessError) return accessError;
  const validation = validateFeatureValue(operation.input, options.input);
  if (!validation.success) {
    return {
      code: "INVALID_INPUT",
      issues: validation.issues,
      requestId: options.context.requestId,
      status: "error",
    };
  }
  if (
    operation.idempotency?.required &&
    !isValidIdempotencyKey(options.idempotencyKey)
  ) {
    return error("IDEMPOTENCY_REQUIRED", options.context.requestId);
  }

  try {
    const limit = await options.ports.rateLimit({
      context: options.context,
      operation: operationKey,
      policy: operation.rateLimit as NonNullable<
        FeatureOperationDefinition["rateLimit"]
      >,
    });
    if (!limit.allowed) {
      return {
        ...error("RATE_LIMITED", options.context.requestId),
        ...(limit.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: limit.retryAfterMs }),
      };
    }
    const handler = options.ports.handlers[operation.handler];
    if (!handler) return error("INTERNAL", options.context.requestId);
    await audit(options, operation, "started");
    const output = await handler({
      context: options.context,
      ...(options.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: options.idempotencyKey }),
      input: validation.value,
      operation,
    });
    const outputValidation = validateFeatureValue(operation.output, output);
    if (!outputValidation.success) throw new Error("Invalid handler output.");
    await audit(options, operation, "succeeded");
    return { data: outputValidation.value, status: "success" };
  } catch (caught) {
    options.ports.reportError?.(caught, options.context.requestId);
    await audit(options, operation, "failed").catch(() => undefined);
    return error("INTERNAL", options.context.requestId);
  }
}

async function authorize(
  operation: FeatureOperationDefinition,
  context: FeatureRequestContext,
  ports: FeatureBackendPorts,
): Promise<FeatureBackendResult | undefined> {
  if (operation.access.mode === "public") return undefined;
  if (!context.actorId) return error("UNAUTHENTICATED", context.requestId);
  const hasPermissions = operation.access.permissions.every((permission) =>
    context.permissions.has(permission),
  );
  if (!hasPermissions) {
    await auditDenied(operation, context, context.actorId, ports).catch(
      () => undefined,
    );
    return error("FORBIDDEN", context.requestId);
  }
  try {
    const allowed = await ports.authorize({ context, operation });
    if (allowed) return undefined;
    await auditDenied(operation, context, context.actorId, ports);
  } catch (caught) {
    ports.reportError?.(caught, context.requestId);
  }
  return error("FORBIDDEN", context.requestId);
}

function auditDenied(
  operation: FeatureOperationDefinition,
  context: FeatureRequestContext,
  actorId: string,
  ports: FeatureBackendPorts,
): Promise<void> {
  return ports.audit({
    actorId,
    event: operation.audit?.event ?? "feature.access.denied",
    operation: operation.id,
    outcome: "denied",
    requestId: context.requestId,
    ...(context.tenantId === undefined ? {} : { tenantId: context.tenantId }),
  });
}

function audit(
  options: Parameters<typeof executeFeatureOperation>[0],
  operation: FeatureOperationDefinition,
  outcome: "failed" | "started" | "succeeded",
): Promise<void> {
  if (!operation.audit?.required) return Promise.resolve();
  return options.ports.audit({
    ...(options.context.actorId === undefined
      ? {}
      : { actorId: options.context.actorId }),
    event: operation.audit.event,
    operation: operation.id,
    outcome,
    requestId: options.context.requestId,
    ...(options.context.tenantId === undefined
      ? {}
      : { tenantId: options.context.tenantId }),
  });
}

function isValidIdempotencyKey(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 128;
}

function error(
  code: Extract<FeatureBackendResult, { status: "error" }>["code"],
  requestId: string,
): Extract<FeatureBackendResult, { status: "error" }> {
  return { code, requestId, status: "error" };
}
