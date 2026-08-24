import { z } from "zod";
import { IdentitySchema, TenantIdSchema } from "./contracts.js";

export const TenancyEventSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.string().regex(/^tenancy\.[a-z.]+\.v1$/),
    occurredAt: z.string().datetime(),
    tenantId: TenantIdSchema,
    actor: IdentitySchema,
    aggregate: z
      .object({
        id: z.string().min(1).max(128),
        type: z.enum(["tenant", "membership", "invitation"]),
        version: z.number().int().positive(),
      })
      .strict(),
    correlationId: z.string().min(1).max(128),
    payload: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  })
  .strict();

export type TenancyEvent = Readonly<z.infer<typeof TenancyEventSchema>>;
