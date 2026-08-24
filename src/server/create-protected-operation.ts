import type { z } from "zod";
import type { AccessGrant } from "../security";
import { issueAccessGrant } from "../security/access-grant";
import type { AuthenticatedRequestContext } from "../security/context";
import {
  CoreError,
  normalizeCoreError,
  type PublicCoreError,
  toPublicCoreError,
} from "../security/errors";
import {
  type OperationName,
  OperationNameSchema,
  type Permission,
  PermissionSchema,
  type RequestId,
  type ResourceReference,
} from "../security/identifiers";
import type {
  AccessDecision,
  ProtectedOperationPorts,
  QuotaReservation,
  ResourceScopePort,
} from "../security/ports";
import { createAuditEvent } from "./audit-event";
import { getTrustedRequestId, parseContext, parseInput } from "./boundary";
import { isAllowedDecision, isGrantedQuota } from "./decisions";

export type ProtectedOperationKind = "query" | "mutation";

export type ProtectedOperationResult<TOutput> =
  | Readonly<{ data: TOutput; ok: true }>
  | Readonly<{ error: PublicCoreError; ok: false }>;

export interface ProtectedHandlerContext {
  readonly access: AccessGrant;
  readonly request: AuthenticatedRequestContext;
}

export interface CreateProtectedOperationOptions<TInput, TOutput> {
  readonly handler: (
    input: TInput,
    context: ProtectedHandlerContext,
  ) => Promise<TOutput>;
  readonly kind: ProtectedOperationKind;
  readonly name: string;
  readonly permission: string;
  readonly ports: ProtectedOperationPorts;
  readonly resourceScope?: ResourceScopePort;
  readonly schema: z.ZodType<TInput>;
}

export interface ExecuteProtectedOperationOptions {
  readonly context: unknown;
  readonly input: unknown;
}

export interface ProtectedOperation<TInput, TOutput> {
  readonly schema: z.ZodType<TInput>;
  execute(
    options: ExecuteProtectedOperationOptions,
  ): Promise<ProtectedOperationResult<TOutput>>;
}

interface OperationRuntime<TInput, TOutput> {
  readonly config: Readonly<{
    kind: ProtectedOperationKind;
    name: OperationName;
    permission: Permission;
  }>;
  readonly options: CreateProtectedOperationOptions<TInput, TOutput>;
}

interface ExecutionState {
  context?: AuthenticatedRequestContext;
  requestId?: RequestId;
  reservation?: QuotaReservation;
  reservationState: "none" | "reserved" | "commit-started" | "committed";
  stage: string;
}

export function createProtectedOperation<TInput, TOutput>(
  options: CreateProtectedOperationOptions<TInput, TOutput>,
): ProtectedOperation<TInput, TOutput> {
  const runtime: OperationRuntime<TInput, TOutput> = {
    config: Object.freeze({
      kind: options.kind,
      name: OperationNameSchema.parse(options.name),
      permission: PermissionSchema.parse(options.permission),
    }),
    options,
  };

  return Object.freeze({
    execute: (execution: ExecuteProtectedOperationOptions) =>
      executeProtectedOperation(runtime, execution),
    schema: options.schema,
  });
}

async function executeProtectedOperation<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  execution: ExecuteProtectedOperationOptions,
): Promise<ProtectedOperationResult<TOutput>> {
  const state = createExecutionState(execution.context);

  try {
    const data = await runPipeline(runtime, execution, state);
    return Object.freeze({ data, ok: true });
  } catch (error) {
    await handleFailure(runtime, state, error);
    return Object.freeze({
      error: toPublicCoreError(error, state.requestId),
      ok: false,
    });
  }
}

async function runPipeline<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  execution: ExecuteProtectedOperationOptions,
  state: ExecutionState,
): Promise<TOutput> {
  const context = parseContext(execution.context);
  state.context = context;
  state.requestId = context.requestId;

  await requirePermission(runtime, context, state);
  const resource = await requireResourceScope(runtime, context, state);
  const input = parseInput(runtime.options.schema, execution.input);
  state.reservation = await reserveQuota(runtime, context, state);
  state.reservationState = "reserved";
  await consumeRateLimit(runtime, context, state);
  await recordMutationIntent(runtime, context, state);
  const access = issueAccessGrant({
    context,
    permission: runtime.config.permission,
    ...(resource ? { resource } : {}),
  });
  const output = await invokeHandler(
    runtime,
    input,
    { access, request: context },
    state,
  );
  await commitReservation(state);
  await recordResult(runtime, context, "succeeded");
  return output;
}

function createExecutionState(context: unknown): ExecutionState {
  const requestId = getTrustedRequestId(context);

  return {
    ...(requestId ? { requestId } : {}),
    reservationState: "none",
    stage: "context",
  };
}

async function requirePermission<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  state: ExecutionState,
): Promise<void> {
  state.stage = "authorization";
  const decision = await callPort(() =>
    runtime.options.ports.authorization.authorize({
      context,
      permission: runtime.config.permission,
    }),
  );
  requireAllowed(decision);
}

async function requireResourceScope<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  state: ExecutionState,
): Promise<ResourceReference | undefined> {
  const scope = runtime.options.resourceScope;
  if (!scope) {
    return undefined;
  }
  if (!context.resource) {
    throw new CoreError("FORBIDDEN");
  }

  state.stage = "resource-scope";
  const resource = context.resource;
  const decision = await callPort(() =>
    scope.authorize({
      context,
      resource,
    }),
  );
  requireAllowed(decision);
  return resource;
}

async function reserveQuota<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  state: ExecutionState,
): Promise<QuotaReservation> {
  state.stage = "quota";
  const decision = await callPort(() =>
    runtime.options.ports.quota.reserve({
      context,
      operation: runtime.config.name,
    }),
  );
  if (!isGrantedQuota(decision)) {
    throw new CoreError("QUOTA_EXCEEDED");
  }
  return decision.reservation;
}

async function consumeRateLimit<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  state: ExecutionState,
): Promise<void> {
  state.stage = "rate-limit";
  const decision = await callPort(() =>
    runtime.options.ports.rateLimit.consume({
      context,
      operation: runtime.config.name,
    }),
  );
  if (!isAllowedDecision(decision)) {
    throw new CoreError("RATE_LIMITED");
  }
}

async function recordMutationIntent<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  state: ExecutionState,
): Promise<void> {
  if (runtime.config.kind !== "mutation") {
    return;
  }

  state.stage = "audit-intent";
  await callPort(() =>
    runtime.options.ports.audit.record(
      createOperationAuditEvent(runtime, context, "intent", "attempted"),
    ),
  );
}

async function invokeHandler<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  input: TInput,
  context: ProtectedHandlerContext,
  state: ExecutionState,
): Promise<TOutput> {
  state.stage = "handler";
  return runtime.options.handler(input, Object.freeze(context));
}

async function commitReservation(state: ExecutionState): Promise<void> {
  const reservation = state.reservation;
  if (!reservation) {
    throw new CoreError("SERVICE_UNAVAILABLE", { reportable: true });
  }

  state.stage = "quota-commit";
  state.reservationState = "commit-started";
  await callPort(() => reservation.commit());
  state.reservationState = "committed";
}

async function handleFailure<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  state: ExecutionState,
  error: unknown,
): Promise<void> {
  const coreError = normalizeCoreError(error);
  await releaseReservation(runtime, state);

  if (state.context) {
    await recordFailure(runtime, state.context, coreError.code);
  }
  if (coreError.reportable) {
    await reportError(runtime, state, error);
  }
}

async function releaseReservation<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  state: ExecutionState,
): Promise<void> {
  if (!state.reservation || state.reservationState !== "reserved") {
    return;
  }

  try {
    await state.reservation.release();
  } catch (error) {
    await reportError(runtime, { ...state, stage: "quota-release" }, error);
  }
}

async function recordResult<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  outcome: "succeeded" | "failed",
  errorCode?: PublicCoreError["code"],
): Promise<void> {
  try {
    await runtime.options.ports.audit.record(
      createOperationAuditEvent(runtime, context, "result", outcome, errorCode),
    );
  } catch (error) {
    await reportError(
      runtime,
      {
        context,
        requestId: context.requestId,
        reservationState: "none",
        stage: "audit-result",
      },
      error,
    );
  }
}

async function recordFailure<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  errorCode: PublicCoreError["code"],
): Promise<void> {
  await recordResult(runtime, context, "failed", errorCode);
}

function createOperationAuditEvent<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  context: AuthenticatedRequestContext,
  phase: "intent" | "result",
  outcome: "attempted" | "succeeded" | "failed",
  errorCode?: PublicCoreError["code"],
): ReturnType<typeof createAuditEvent> {
  const timestamp = runtime.options.ports.clock.now().toISOString();

  return createAuditEvent({
    context,
    ...(errorCode ? { errorCode } : {}),
    operation: runtime.config.name,
    outcome,
    permission: runtime.config.permission,
    phase,
    timestamp,
  });
}

async function reportError<TInput, TOutput>(
  runtime: OperationRuntime<TInput, TOutput>,
  state: ExecutionState,
  error: unknown,
): Promise<void> {
  try {
    await runtime.options.ports.reporter.report({
      error,
      operation: runtime.config.name,
      ...(state.requestId ? { requestId: state.requestId } : {}),
      stage: state.stage,
    });
  } catch {
    // A reporter must never alter the protected operation's decision.
  }
}

async function callPort<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new CoreError("SERVICE_UNAVAILABLE", {
      cause: error,
      reportable: true,
    });
  }
}

function requireAllowed(decision: AccessDecision): void {
  if (!isAllowedDecision(decision)) {
    throw new CoreError("FORBIDDEN");
  }
}
