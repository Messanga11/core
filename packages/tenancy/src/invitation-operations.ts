import {
  type AcceptInvitationCommandInput,
  AcceptInvitationCommandSchema,
  type Invitation,
  type InvitationMutationCommandInput,
  InvitationMutationCommandSchema,
  type InviteMemberCommandInput,
  InviteMemberCommandSchema,
  type Membership,
} from "./contracts.js";
import { TenancyError } from "./errors.js";
import {
  advanceTenant,
  authorizeMutation,
  emit,
  type MutationRunner,
  requireTenant,
  type TenancyServiceDependencies,
} from "./service-support.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createInvitationOperations(
  dependencies: TenancyServiceDependencies,
  mutate: MutationRunner,
) {
  const inviteMember = async (input: InviteMemberCommandInput) => {
    const command = InviteMemberCommandSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await authorizeMutation(
        tx,
        command.tenantId,
        command.actor,
        "tenant.members.invite",
        command.expectedVersion,
      );
      const token = await dependencies.crypto.generateToken(32);
      const invitation: Invitation = {
        acceptedAt: null,
        email: command.email,
        expiresAt: expiresAt(dependencies),
        id: command.invitationId,
        revokedAt: null,
        role: command.role,
        tenantId: command.tenantId,
        tokenHash: await dependencies.crypto.hashToken(token),
        version: 1,
      };
      await tx.insertInvitation(invitation);
      await advanceTenant(tx, tenant);
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: invitation.id,
        aggregateType: "invitation",
        correlationId: command.idempotencyKey,
        payload: { role: invitation.role },
        tenantId: tenant.id,
        type: "tenancy.invitation.created.v1",
        version: 1,
      });
      return { invitation, token };
    });
  };

  const reinviteMember = async (input: InvitationMutationCommandInput) => {
    const command = InvitationMutationCommandSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await authorizeMutation(
        tx,
        command.tenantId,
        command.actor,
        "tenant.members.invite",
        command.expectedVersion,
      );
      const invitation = await tx.findInvitationById(
        command.tenantId,
        command.invitationId,
      );
      if (!invitation) throw new TenancyError("NOT_FOUND");
      if (invitation.acceptedAt) throw new TenancyError("INVITATION_INVALID");
      const token = await dependencies.crypto.generateToken(32);
      const next = {
        ...invitation,
        expiresAt: expiresAt(dependencies),
        revokedAt: null,
        tokenHash: await dependencies.crypto.hashToken(token),
        version: invitation.version + 1,
      };
      if (!(await tx.saveInvitation(next, invitation.version)))
        throw new TenancyError("CONFLICT");
      await advanceTenant(tx, tenant);
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: next.id,
        aggregateType: "invitation",
        correlationId: command.idempotencyKey,
        payload: { role: next.role },
        tenantId: tenant.id,
        type: "tenancy.invitation.reissued.v1",
        version: next.version,
      });
      return { invitation: next, token };
    });
  };

  const revokeInvitation = async (input: InvitationMutationCommandInput) => {
    const command = InvitationMutationCommandSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await authorizeMutation(
        tx,
        command.tenantId,
        command.actor,
        "tenant.members.invite",
        command.expectedVersion,
      );
      const current = await tx.findInvitationById(
        command.tenantId,
        command.invitationId,
      );
      if (!current) throw new TenancyError("NOT_FOUND");
      if (current.acceptedAt) throw new TenancyError("INVITATION_INVALID");
      const invitation = {
        ...current,
        revokedAt: dependencies.clock.now().toISOString(),
        version: current.version + 1,
      };
      if (!(await tx.saveInvitation(invitation, current.version)))
        throw new TenancyError("CONFLICT");
      await advanceTenant(tx, tenant);
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: invitation.id,
        aggregateType: "invitation",
        correlationId: command.idempotencyKey,
        payload: {},
        tenantId: tenant.id,
        type: "tenancy.invitation.revoked.v1",
        version: invitation.version,
      });
      return invitation;
    });
  };

  const acceptInvitation = async (input: AcceptInvitationCommandInput) => {
    const command = AcceptInvitationCommandSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await requireTenant(
        tx,
        command.tenantId,
        command.expectedVersion,
      );
      const tokenHash = await dependencies.crypto.hashToken(
        command.invitationToken,
      );
      const current = await tx.findInvitationByHash(
        command.tenantId,
        tokenHash,
      );
      if (
        !current ||
        current.revokedAt ||
        current.acceptedAt ||
        Date.parse(current.expiresAt) <= dependencies.clock.now().getTime()
      )
        throw new TenancyError("INVITATION_INVALID");
      const membership: Membership = {
        id: command.membershipId,
        identity: command.actor,
        role: current.role,
        status: "active",
        tenantId: command.tenantId,
        version: 1,
      };
      const invitation = {
        ...current,
        acceptedAt: dependencies.clock.now().toISOString(),
        version: current.version + 1,
      };
      if (!(await tx.saveInvitation(invitation, current.version)))
        throw new TenancyError("CONFLICT");
      await tx.insertMembership(membership);
      await advanceTenant(tx, tenant);
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: membership.id,
        aggregateType: "membership",
        correlationId: command.idempotencyKey,
        payload: { role: membership.role },
        tenantId: tenant.id,
        type: "tenancy.invitation.accepted.v1",
        version: 1,
      });
      return membership;
    });
  };

  return { acceptInvitation, inviteMember, reinviteMember, revokeInvitation };
}

function expiresAt(dependencies: TenancyServiceDependencies) {
  return new Date(
    dependencies.clock.now().getTime() + INVITATION_TTL_MS,
  ).toISOString();
}
