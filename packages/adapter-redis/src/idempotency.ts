import { randomUUID } from "node:crypto";
import type { JsonValue } from "@messanga11/core";
import { z } from "zod";

import {
  createPrivateKey,
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

const OptionsSchema = z.object({ namespace: NamespaceSchema }).strict();
const RequestSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    scope: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    ttlMs: TtlSchema,
  })
  .strict();
const AcquireResultSchema = z.union([
  z.tuple([z.literal(1)]),
  z.tuple([z.literal(0), z.string().min(1).max(1_048_576)]),
]);

export interface IdempotencyRequest {
  readonly key: string;
  readonly scope: string;
  readonly ttlMs: number;
}

export interface IdempotencyLease {
  complete(value: JsonValue): Promise<void>;
  release(): Promise<void>;
}

export type IdempotencyDecision =
  | Readonly<{ acquired: true; lease: IdempotencyLease }>
  | Readonly<{ acquired: false; state: "in_progress" }>
  | Readonly<{ acquired: false; state: "replay"; value: JsonValue }>;

export interface IdempotencyPort {
  acquire(request: IdempotencyRequest): Promise<IdempotencyDecision>;
}

export interface RedisIdempotencyOptions {
  readonly namespace: string;
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

function createLease(options: {
  readonly functions: AtomicFunctionInvoker;
  readonly key: string;
  readonly token: string;
  readonly ttlMs: number;
}): IdempotencyLease {
  return Object.freeze({
    async complete(value: JsonValue) {
      const validated = z.json().safeParse(value);
      if (!validated.success) {
        throw new RedisAdapterError("INVALID_CONFIGURATION", validated.error);
      }
      await requireConfirmation(
        options.functions.call(
          "m11_idempotency_complete_v1",
          [options.key],
          [
            options.token,
            JSON.stringify(validated.data),
            String(options.ttlMs),
          ],
        ),
      );
    },
    release: () =>
      requireConfirmation(
        options.functions.call(
          "m11_idempotency_release_v1",
          [options.key],
          [options.token],
        ),
      ),
  });
}

function parseStoredValue(value: string): IdempotencyDecision {
  if (value.startsWith("pending:")) {
    return Object.freeze({ acquired: false, state: "in_progress" });
  }
  if (!value.startsWith("complete:")) {
    throw new RedisAdapterError("SERVICE_UNAVAILABLE");
  }

  try {
    const decoded: unknown = JSON.parse(value.slice("complete:".length));
    const result = z.json().safeParse(decoded);
    if (!result.success) {
      throw result.error;
    }
    const replayValue =
      typeof result.data === "object" && result.data !== null
        ? Object.freeze(result.data)
        : result.data;
    return Object.freeze({
      acquired: false,
      state: "replay",
      value: replayValue,
    });
  } catch (error) {
    throw new RedisAdapterError("SERVICE_UNAVAILABLE", error);
  }
}

export function createRedisIdempotencyPort(
  untrustedOptions: RedisIdempotencyOptions,
): IdempotencyPort {
  const { transport, ...values } = untrustedOptions;
  const options = parseConfiguration(OptionsSchema, values);
  const functions = createAtomicFunctionInvoker(transport);

  return Object.freeze({
    async acquire(untrustedRequest: IdempotencyRequest) {
      const request = parseConfiguration(RequestSchema, untrustedRequest);
      const key = createPrivateKey(options.namespace, "idempotency", [
        request.scope,
        request.key,
      ]);
      const token = randomUUID();
      try {
        const result = AcquireResultSchema.safeParse(
          await functions.call(
            "m11_idempotency_acquire_v1",
            [key],
            [token, String(request.ttlMs)],
          ),
        );
        if (!result.success) {
          throw new RedisAdapterError("SERVICE_UNAVAILABLE", result.error);
        }
        if (result.data[0] === 0) {
          return parseStoredValue(result.data[1]);
        }
        return Object.freeze({
          acquired: true as const,
          lease: createLease({
            functions,
            key,
            token,
            ttlMs: request.ttlMs,
          }),
        });
      } catch (error) {
        if (error instanceof RedisAdapterError) {
          throw error;
        }
        throw new RedisAdapterError("SERVICE_UNAVAILABLE", error);
      }
    },
  });
}
