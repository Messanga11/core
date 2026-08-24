import { initTRPC, type TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";

import type { PublicCoreError } from "../security";
import { parseAuthenticatedRequestContext } from "../security";
import type { ProtectedOperation } from "../server";

export interface CoreTRPCContext {
  readonly requestContext: unknown;
}

const TRPC_ERROR_CODES: Readonly<
  Record<PublicCoreError["code"], TRPC_ERROR_CODE_KEY>
> = {
  FORBIDDEN: "FORBIDDEN",
  INTERNAL: "INTERNAL_SERVER_ERROR",
  INVALID_INPUT: "BAD_REQUEST",
  QUOTA_EXCEEDED: "TOO_MANY_REQUESTS",
  RATE_LIMITED: "TOO_MANY_REQUESTS",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  UNAUTHENTICATED: "UNAUTHORIZED",
};

export function createCoreTRPC() {
  const trpc = initTRPC.context<CoreTRPCContext>().create({
    errorFormatter({ shape }) {
      const publicData = { ...shape.data };
      delete publicData.stack;
      return { ...shape, data: publicData };
    },
  });

  const requireAuthentication = trpc.middleware(({ ctx, next }) => {
    try {
      parseAuthenticatedRequestContext(ctx.requestContext);
    } catch {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      });
    }

    return next();
  });

  const protectedProcedure = trpc.procedure.use(requireAuthentication);

  return Object.freeze({
    guardedMutation: <TInput, TOutput>(
      operation: ProtectedOperation<TInput, TOutput>,
    ) =>
      protectedProcedure
        .input(operation.schema)
        .mutation(async ({ ctx, input }) =>
          executeOrThrow(operation, input, ctx.requestContext),
        ),
    guardedQuery: <TInput, TOutput>(
      operation: ProtectedOperation<TInput, TOutput>,
    ) =>
      protectedProcedure
        .input(operation.schema)
        .query(async ({ ctx, input }) =>
          executeOrThrow(operation, input, ctx.requestContext),
        ),
    router: trpc.router,
  });
}

export function toTRPCError(error: PublicCoreError): TRPCError {
  return new TRPCError({
    code: TRPC_ERROR_CODES[error.code],
    message: error.message,
  });
}

async function executeOrThrow<TInput, TOutput>(
  operation: ProtectedOperation<TInput, TOutput>,
  input: unknown,
  context: unknown,
): Promise<TOutput> {
  const result = await operation.execute({ context, input });
  if (!result.ok) {
    throw toTRPCError(result.error);
  }
  return result.data;
}
