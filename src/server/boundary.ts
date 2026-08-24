import type { z } from "zod";

import {
  type AuthenticatedRequestContext,
  parseAuthenticatedRequestContext,
} from "../security/context";
import { CoreError } from "../security/errors";
import { type RequestId, RequestIdSchema } from "../security/identifiers";

export function getTrustedRequestId(context: unknown): RequestId | undefined {
  if (typeof context !== "object" || context === null) {
    return undefined;
  }

  try {
    const result = RequestIdSchema.safeParse(Reflect.get(context, "requestId"));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseContext(value: unknown): AuthenticatedRequestContext {
  try {
    return parseAuthenticatedRequestContext(value);
  } catch {
    throw new CoreError("UNAUTHENTICATED");
  }
}

export function parseInput<TInput>(
  schema: z.ZodType<TInput>,
  input: unknown,
): TInput {
  try {
    const result = schema.safeParse(input);
    if (result.success) {
      return result.data;
    }
  } catch {
    // Hostile getters and proxies are invalid input, not internal failures.
  }

  throw new CoreError("INVALID_INPUT");
}
