import type {
  AuthenticatedRequestContext,
  OperationName,
  RateLimitPort,
} from "@messanga11/core/server";
import { z } from "zod";

import {
  CostSchema,
  createPrivateKey,
  LimitSchema,
  NamespaceSchema,
  parseConfiguration,
  TtlSchema,
} from "./config";
import {
  type AtomicFunctionTransport,
  createAtomicFunctionInvoker,
} from "./transport";

const OptionsSchema = z
  .object({
    cost: CostSchema.default(1),
    limit: LimitSchema,
    namespace: NamespaceSchema,
    windowMs: TtlSchema.max(86_400_000),
  })
  .strict();
const ResultSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.number().int().min(0),
  z.number().int().min(0),
]);

export interface RedisRateLimitOptions {
  readonly cost?: number;
  readonly limit: number;
  readonly namespace: string;
  readonly transport: AtomicFunctionTransport;
  readonly windowMs: number;
}

export function createRedisRateLimitPort(
  untrustedOptions: RedisRateLimitOptions,
): RateLimitPort {
  const { transport, ...values } = untrustedOptions;
  const options = parseConfiguration(OptionsSchema, values);
  const functions = createAtomicFunctionInvoker(transport);

  return Object.freeze({
    async consume({
      context,
      operation,
    }: {
      readonly context: AuthenticatedRequestContext;
      readonly operation: OperationName;
    }) {
      const key = createPrivateKey(options.namespace, "rate", [
        context.tenantId,
        context.actor.id,
        operation,
      ]);
      try {
        const result = ResultSchema.safeParse(
          await functions.call(
            "m11_rate_limit_v1",
            [key],
            [
              String(options.cost),
              String(options.limit),
              String(options.windowMs),
            ],
          ),
        );
        return Object.freeze({
          allowed: result.success && result.data[0] === 1,
        });
      } catch {
        return Object.freeze({ allowed: false });
      }
    },
  });
}
