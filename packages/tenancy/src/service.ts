import {
  type ChangeMembershipCommandInput,
  ChangeMembershipCommandSchema,
  type CreateTenantCommandInput,
  CreateTenantCommandSchema,
  type Membership,
  type MembershipMutationCommandInput,
  MembershipMutationCommandSchema,
  type Tenant,
  type TenantMutationInput,
  TenantMutationSchema,
  type TransferOwnershipCommandInput,
  TransferOwnershipCommandSchema,
} from "./contracts.js";
import { TenancyError } from "./errors.js";
import { createInvitationOperations } from "./invitation-operations.js";
import {
  advanceTenant,
  assertAnotherOwner,
  authorizeMutation,
  createMutationRunner,
  emit,
  requireMembership,
  type TenancyServiceDependencies,
} from "./service-support.js";

export type { TenancyServiceDependencies } from "./service-support.js";

export function createTenancyService(dependencies: TenancyServiceDependencies) {
  const mutate = createMutationRunner(dependencies);
  const invitationOperations = createInvitationOperations(dependencies, mutate);

  const createTenant = async (input: CreateTenantCommandInput) => {
    const command = CreateTenantCommandSchema.parse(input);
    return dependencies.unitOfWork.withTenantTransaction(
      command.tenantId,
      async (tx) => {
        if (await tx.findTenant(command.tenantId)) {
          if (
            !(await tx.reserveIdempotency(
              command.tenantId,
              command.idempotencyKey,
            ))
          )
            throw new TenancyError("REPLAYED");
          throw new TenancyError("CONFLICT");
        }
        const tenant: Tenant = {
          id: command.tenantId,
          name: command.name,
          status: "active",
          version: 1,
        };
        const owner: Membership = {
          id: command.membershipId,
          identity: command.owner,
          role: "owner",
          status: "active",
          tenantId: command.tenantId,
          version: 1,
        };
        await tx.insertTenant(tenant);
        if (
          !(await tx.reserveIdempotency(
            command.tenantId,
            command.idempotencyKey,
          ))
        )
          throw new TenancyError("REPLAYED");
        await tx.insertMembership(owner);
        await emit(tx, dependencies, {
          actor: command.owner,
          aggregateId: tenant.id,
          aggregateType: "tenant",
          correlationId: command.idempotencyKey,
          payload: { name: tenant.name },
          tenantId: tenant.id,
          type: "tenancy.tenant.created.v1",
          version: 1,
        });
        return { tenant, owner };
      },
    );
  };

  const suspendTenant = async (input: TenantMutationInput) => {
    const command = TenantMutationSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await authorizeMutation(
        tx,
        command.tenantId,
        command.actor,
        "tenant.suspend",
        command.expectedVersion,
      );
      const next = {
        ...tenant,
        status: "suspended" as const,
        version: tenant.version + 1,
      };
      if (!(await tx.saveTenant(next, tenant.version)))
        throw new TenancyError("CONFLICT");
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: tenant.id,
        aggregateType: "tenant",
        correlationId: command.idempotencyKey,
        payload: {},
        tenantId: tenant.id,
        type: "tenancy.tenant.suspended.v1",
        version: next.version,
      });
      return next;
    });
  };

  const changeMembership = async (input: ChangeMembershipCommandInput) =>
    updateMembership(input, "change");
  const suspendMembership = async (input: MembershipMutationCommandInput) =>
    updateMembership(input, "suspend");

  async function updateMembership(
    input: ChangeMembershipCommandInput | MembershipMutationCommandInput,
    operation: "change" | "suspend",
  ) {
    const command =
      operation === "change"
        ? ChangeMembershipCommandSchema.parse(input)
        : MembershipMutationCommandSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await authorizeMutation(
        tx,
        command.tenantId,
        command.actor,
        "tenant.members.manage",
        command.expectedVersion,
      );
      const current = await requireMembership(
        tx,
        command.tenantId,
        command.membershipId,
      );
      const role =
        operation === "change"
          ? (command as ReturnType<typeof ChangeMembershipCommandSchema.parse>)
              .role
          : current.role;
      const status =
        operation === "suspend" ? ("suspended" as const) : current.status;
      if (current.role === "owner" && (role !== "owner" || status !== "active"))
        await assertAnotherOwner(tx, tenant.id);
      const membership = {
        ...current,
        role,
        status,
        version: current.version + 1,
      };
      if (!(await tx.saveMembership(membership, current.version)))
        throw new TenancyError("CONFLICT");
      await advanceTenant(tx, tenant);
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: membership.id,
        aggregateType: "membership",
        correlationId: command.idempotencyKey,
        payload: { role: membership.role, status: membership.status },
        tenantId: tenant.id,
        type: `tenancy.membership.${operation === "change" ? "changed" : "suspended"}.v1`,
        version: membership.version,
      });
      return membership;
    });
  }

  const removeMembership = async (input: MembershipMutationCommandInput) => {
    const command = MembershipMutationCommandSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await authorizeMutation(
        tx,
        command.tenantId,
        command.actor,
        "tenant.members.remove",
        command.expectedVersion,
      );
      const membership = await requireMembership(
        tx,
        command.tenantId,
        command.membershipId,
      );
      if (membership.role === "owner") await assertAnotherOwner(tx, tenant.id);
      if (
        !(await tx.removeMembership(
          tenant.id,
          membership.id,
          membership.version,
        ))
      )
        throw new TenancyError("CONFLICT");
      await advanceTenant(tx, tenant);
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: membership.id,
        aggregateType: "membership",
        correlationId: command.idempotencyKey,
        payload: { role: membership.role },
        tenantId: tenant.id,
        type: "tenancy.membership.removed.v1",
        version: membership.version + 1,
      });
    });
  };

  const transferOwnership = async (input: TransferOwnershipCommandInput) => {
    const command = TransferOwnershipCommandSchema.parse(input);
    return mutate(command.tenantId, command.idempotencyKey, async (tx) => {
      const tenant = await authorizeMutation(
        tx,
        command.tenantId,
        command.actor,
        "tenant.ownership.transfer",
        command.expectedVersion,
      );
      const current = await requireMembership(
        tx,
        tenant.id,
        command.membershipId,
      );
      const target = await requireMembership(
        tx,
        tenant.id,
        command.newOwnerMembershipId,
      );
      if (
        current.identity.id !== command.actor.id ||
        current.role !== "owner" ||
        target.status !== "active"
      )
        throw new TenancyError("FORBIDDEN");
      const nextCurrent = {
        ...current,
        role: "admin" as const,
        version: current.version + 1,
      };
      const nextTarget = {
        ...target,
        role: "owner" as const,
        version: target.version + 1,
      };
      if (
        !(await tx.saveMembership(nextTarget, target.version)) ||
        !(await tx.saveMembership(nextCurrent, current.version))
      )
        throw new TenancyError("CONFLICT");
      await advanceTenant(tx, tenant);
      await emit(tx, dependencies, {
        actor: command.actor,
        aggregateId: target.id,
        aggregateType: "membership",
        correlationId: command.idempotencyKey,
        payload: { previousOwnerMembershipId: current.id },
        tenantId: tenant.id,
        type: "tenancy.ownership.transferred.v1",
        version: nextTarget.version,
      });
      return { newOwner: nextTarget, previousOwner: nextCurrent };
    });
  };

  return {
    ...invitationOperations,
    changeMembership,
    createTenant,
    removeMembership,
    suspendMembership,
    suspendTenant,
    transferOwnership,
  };
}
