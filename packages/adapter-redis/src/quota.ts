import { randomUUID } from "node:crypto";
import type {
  AuthenticatedRequestContext,
  OperationName,
  QuotaPort,
  QuotaReservation,
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
import { RedisAdapterError } from "./errors";
import {
  type AtomicFunctionInvoker,
  type AtomicFunctionTransport,
  createAtomicFunctionInvoker,
} from "./transport";

const OptionsSchema = z
  .object({
    cost: CostSchema.default(1),
    limit: LimitSchema,
    namespace: NamespaceSchema,
    reservationTtlMs: TtlSchema,
  })
  .strict();
const ReserveResultSchema = z.tuple([z.union([z.literal(0), z.literal(1)])]);

export interface RedisQuotaOptions {
  readonly cost?: number;
  readonly limit: number;
  readonly namespace: string;
  readonly reservationTtlMs: number;
  readonly transport: AtomicFunctionTransport;
}

async function requireConfirmation(operation: Promise<unknown>): Promise<void> {
  try {
    if ((await operation) !== 1) {
      throw new RedisAdapterError("SERVICE_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof RedisAdapterError) {
      throw error;
    }
    throw new RedisAdapterError("SERVICE_UNAVAILABLE", error);
  }
}

function createReservation(options: {
  readonly cost: number;
  readonly functions: AtomicFunctionInvoker;
  readonly quotaKey: string;
  readonly reservationKey: string;
}): QuotaReservation {
  return Object.freeze({
    commit: () =>
      requireConfirmation(
        options.functions.call(
          "m11_quota_commit_v1",
          [options.reservationKey],
          [],
        ),
      ),
    release: () =>
      requireConfirmation(
        options.functions.call(
          "m11_quota_release_v1",
          [options.quotaKey, options.reservationKey],
          [String(options.cost)],
        ),
      ),
  });
}

export function createRedisQuotaPort(
  untrustedOptions: RedisQuotaOptions,
): QuotaPort {
  const { transport, ...values } = untrustedOptions;
  const options = parseConfiguration(OptionsSchema, values);
  const functions = createAtomicFunctionInvoker(transport);

  return Object.freeze({
    async reserve({
      context,
      operation,
    }: {
      readonly context: AuthenticatedRequestContext;
      readonly operation: OperationName;
    }) {
      const scope = [context.tenantId, context.actor.id, operation];
      const quotaKey = createPrivateKey(options.namespace, "quota", scope);
      const reservationKey = createPrivateKey(
        options.namespace,
        "quota-reservation",
        [...scope, randomUUID()],
      );
      try {
        const result = ReserveResultSchema.safeParse(
          await functions.call(
            "m11_quota_reserve_v1",
            [quotaKey, reservationKey],
            [
              String(options.cost),
              String(options.limit),
              String(options.reservationTtlMs),
            ],
          ),
        );
        if (!result.success || result.data[0] !== 1) {
          return Object.freeze({ allowed: false as const });
        }

        return Object.freeze({
          allowed: true as const,
          reservation: createReservation({
            cost: options.cost,
            functions,
            quotaKey,
            reservationKey,
          }),
        });
      } catch {
        return Object.freeze({ allowed: false as const });
      }
    },
  });
}
