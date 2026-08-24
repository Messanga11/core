import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const revision = z.number().int().nonnegative();
const mutation = {
  expectedVersion: revision,
  idempotencyKey: z.string().min(16).max(128),
};

export const TenantIdSchema = id.brand<"TenantId">();
export const IdentityIdSchema = id.brand<"IdentityId">();
export const MembershipIdSchema = id.brand<"MembershipId">();
export const InvitationIdSchema = id.brand<"InvitationId">();
export const TenantRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export const IdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human"), id: IdentityIdSchema }).strict(),
  z.object({ kind: z.literal("service"), id: IdentityIdSchema }).strict(),
]);

export const TenantSchema = z
  .object({
    id: TenantIdSchema,
    name: z.string().trim().min(1).max(120),
    status: z.enum(["active", "suspended"]),
    version: revision,
  })
  .strict();

export const MembershipSchema = z
  .object({
    id: MembershipIdSchema,
    tenantId: TenantIdSchema,
    identity: IdentitySchema,
    role: TenantRoleSchema,
    status: z.enum(["active", "suspended"]),
    version: revision,
  })
  .strict();

export const InvitationSchema = z
  .object({
    id: InvitationIdSchema,
    tenantId: TenantIdSchema,
    email: z.string().trim().toLowerCase().email().max(320),
    role: TenantRoleSchema.exclude(["owner"]),
    tokenHash: z.string().min(32).max(256),
    expiresAt: z.string().datetime(),
    revokedAt: z.string().datetime().nullable(),
    acceptedAt: z.string().datetime().nullable(),
    version: revision,
  })
  .strict();

export const CreateTenantCommandSchema = z
  .object({
    ...mutation,
    expectedVersion: z.literal(0),
    tenantId: TenantIdSchema,
    membershipId: MembershipIdSchema,
    name: z.string().trim().min(1).max(120),
    owner: IdentitySchema,
  })
  .strict();

export const TenantMutationSchema = z
  .object({
    ...mutation,
    actor: IdentitySchema,
    tenantId: TenantIdSchema,
  })
  .strict();

export const InviteMemberCommandSchema = TenantMutationSchema.extend({
  email: z.string().trim().toLowerCase().email().max(320),
  invitationId: InvitationIdSchema,
  role: TenantRoleSchema.exclude(["owner"]),
}).strict();

export const InvitationMutationCommandSchema = TenantMutationSchema.extend({
  invitationId: InvitationIdSchema,
}).strict();

export const AcceptInvitationCommandSchema = z
  .object({
    ...mutation,
    actor: IdentitySchema,
    invitationToken: z.string().min(32).max(512),
    membershipId: MembershipIdSchema,
    tenantId: TenantIdSchema,
  })
  .strict();

export const MembershipMutationCommandSchema = TenantMutationSchema.extend({
  membershipId: MembershipIdSchema,
}).strict();

export const ChangeMembershipCommandSchema =
  MembershipMutationCommandSchema.extend({
    role: TenantRoleSchema,
  }).strict();

export const TransferOwnershipCommandSchema =
  MembershipMutationCommandSchema.extend({
    newOwnerMembershipId: MembershipIdSchema,
  }).strict();

export type TenantId = z.infer<typeof TenantIdSchema>;
export type Identity = Readonly<z.infer<typeof IdentitySchema>>;
export type TenantRole = z.infer<typeof TenantRoleSchema>;
export type Tenant = Readonly<z.infer<typeof TenantSchema>>;
export type Membership = Readonly<z.infer<typeof MembershipSchema>>;
export type Invitation = Readonly<z.infer<typeof InvitationSchema>>;
export type CreateTenantCommand = Readonly<
  z.infer<typeof CreateTenantCommandSchema>
>;
export type TenantMutation = Readonly<z.infer<typeof TenantMutationSchema>>;
export type InviteMemberCommand = Readonly<
  z.infer<typeof InviteMemberCommandSchema>
>;
export type InvitationMutationCommand = Readonly<
  z.infer<typeof InvitationMutationCommandSchema>
>;
export type AcceptInvitationCommand = Readonly<
  z.infer<typeof AcceptInvitationCommandSchema>
>;
export type MembershipMutationCommand = Readonly<
  z.infer<typeof MembershipMutationCommandSchema>
>;
export type ChangeMembershipCommand = Readonly<
  z.infer<typeof ChangeMembershipCommandSchema>
>;
export type TransferOwnershipCommand = Readonly<
  z.infer<typeof TransferOwnershipCommandSchema>
>;
export type CreateTenantCommandInput = Readonly<
  z.input<typeof CreateTenantCommandSchema>
>;
export type TenantMutationInput = Readonly<
  z.input<typeof TenantMutationSchema>
>;
export type InviteMemberCommandInput = Readonly<
  z.input<typeof InviteMemberCommandSchema>
>;
export type InvitationMutationCommandInput = Readonly<
  z.input<typeof InvitationMutationCommandSchema>
>;
export type AcceptInvitationCommandInput = Readonly<
  z.input<typeof AcceptInvitationCommandSchema>
>;
export type MembershipMutationCommandInput = Readonly<
  z.input<typeof MembershipMutationCommandSchema>
>;
export type ChangeMembershipCommandInput = Readonly<
  z.input<typeof ChangeMembershipCommandSchema>
>;
export type TransferOwnershipCommandInput = Readonly<
  z.input<typeof TransferOwnershipCommandSchema>
>;
