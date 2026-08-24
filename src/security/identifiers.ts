import { z } from "zod";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PERMISSION_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;

const identifier = z.string().min(1).max(128).regex(IDENTIFIER_PATTERN);

export const ActorIdSchema = identifier.brand<"ActorId">();
export const TenantIdSchema = identifier.brand<"TenantId">();
export const RequestIdSchema = identifier.brand<"RequestId">();
export const ResourceIdSchema = identifier.brand<"ResourceId">();
export const ResourceTypeSchema = identifier.brand<"ResourceType">();
export const OperationNameSchema = identifier.brand<"OperationName">();
export const PermissionSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(PERMISSION_PATTERN)
  .brand<"Permission">();

export type ActorId = z.infer<typeof ActorIdSchema>;
export type TenantId = z.infer<typeof TenantIdSchema>;
export type RequestId = z.infer<typeof RequestIdSchema>;
export type ResourceId = z.infer<typeof ResourceIdSchema>;
export type ResourceType = z.infer<typeof ResourceTypeSchema>;
export type OperationName = z.infer<typeof OperationNameSchema>;
export type Permission = z.infer<typeof PermissionSchema>;

export const ResourceReferenceSchema = z
  .object({
    id: ResourceIdSchema,
    type: ResourceTypeSchema,
  })
  .strict();

export type ResourceReference = Readonly<
  z.infer<typeof ResourceReferenceSchema>
>;
