import { z } from "zod";

import {
  ActorIdSchema,
  RequestIdSchema,
  ResourceReferenceSchema,
  TenantIdSchema,
} from "./identifiers";

const ActorSchema = z.object({ id: ActorIdSchema }).strict();

export const AuthenticatedRequestContextSchema = z
  .object({
    actor: ActorSchema,
    requestId: RequestIdSchema,
    resource: ResourceReferenceSchema.optional(),
    tenantId: TenantIdSchema,
  })
  .strict();

export type AuthenticatedRequestContext = Readonly<
  z.infer<typeof AuthenticatedRequestContextSchema>
>;

export function parseAuthenticatedRequestContext(
  value: unknown,
): AuthenticatedRequestContext {
  const context = AuthenticatedRequestContextSchema.parse(value);
  const resource = context.resource
    ? Object.freeze(context.resource)
    : undefined;

  return Object.freeze({
    actor: Object.freeze(context.actor),
    requestId: context.requestId,
    ...(resource ? { resource } : {}),
    tenantId: context.tenantId,
  });
}
