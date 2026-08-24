import { createHash } from "node:crypto";
import { z } from "zod";

import { RedisAdapterError } from "./errors";

export const NamespaceSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const CostSchema = z.number().int().min(1).max(1_000_000);
export const LimitSchema = z.number().int().min(1).max(1_000_000_000);
export const TtlSchema = z.number().int().min(100).max(2_592_000_000);

export function parseConfiguration<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RedisAdapterError("INVALID_CONFIGURATION", result.error);
  }
  return result.data;
}

export function createPrivateKey(
  namespace: string,
  purpose: string,
  parts: readonly string[],
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(parts), "utf8")
    .digest("hex");
  return `${namespace}:${purpose}:${digest}`;
}
