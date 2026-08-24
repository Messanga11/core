import type { Identity, Tenant, TenantId } from "./contracts.js";
import { TenancyError } from "./errors.js";
import type { TenancyEvent } from "./events.js";
import type { TenantPermission } from "./permissions.js";
import { evaluateTenantPermission } from "./policy.js";
import type {
  InvitationCryptoPort,
  TenancyClockPort,
  TenancyIdPort,
  TenancyTransaction,
  TenancyUnitOfWorkPort,
} from "./ports.js";

export interface TenancyServiceDependencies {
  readonly clock: TenancyClockPort;
  readonly crypto: InvitationCryptoPort;
  readonly ids: TenancyIdPort;
  readonly unitOfWork: TenancyUnitOfWorkPort;
}

export type MutationRunner = <T>(
  tenantId: TenantId,
  key: string,
  work: (transaction: TenancyTransaction) => Promise<T>,
) => Promise<T>;

export function createMutationRunner(
  dependencies: TenancyServiceDependencies,
): MutationRunner {
  return (tenantId, key, work) =>
    dependencies.unitOfWork.withTenantTransaction(tenantId, async (tx) => {
      if (!(await tx.reserveIdempotency(tenantId, key)))
        throw new TenancyError("REPLAYED");
      return work(tx);
    });
}

export async function authorizeMutation(
  tx: TenancyTransaction,
  tenantId: TenantId,
  actor: Identity,
  permission: TenantPermission,
  expectedVersion: number,
) {
  const tenant = await requireTenant(tx, tenantId, expectedVersion);
  const membership = await tx.findMembership(tenantId, actor.id);
  if (evaluateTenantPermission({ membership, permission }).status !== "allowed")
    throw new TenancyError("FORBIDDEN");
  return tenant;
}

export async function requireTenant(
  tx: TenancyTransaction,
  tenantId: TenantId,
  expected: number,
) {
  const tenant = await tx.findTenant(tenantId);
  if (!tenant) throw new TenancyError("NOT_FOUND");
  if (tenant.version !== expected) throw new TenancyError("CONFLICT");
  return tenant;
}

export async function requireMembership(
  tx: TenancyTransaction,
  tenantId: TenantId,
  id: string,
) {
  const membership = await tx.findMembershipById(tenantId, id);
  if (!membership) throw new TenancyError("NOT_FOUND");
  return membership;
}

export async function advanceTenant(tx: TenancyTransaction, tenant: Tenant) {
  const next = { ...tenant, version: tenant.version + 1 };
  if (!(await tx.saveTenant(next, tenant.version)))
    throw new TenancyError("CONFLICT");
}

export async function assertAnotherOwner(
  tx: TenancyTransaction,
  tenantId: TenantId,
) {
  if ((await tx.countActiveOwners(tenantId)) <= 1)
    throw new TenancyError("LAST_OWNER");
}

export async function emit(
  tx: TenancyTransaction,
  dependencies: TenancyServiceDependencies,
  options: {
    actor: Identity;
    aggregateId: string;
    aggregateType: "tenant" | "membership" | "invitation";
    correlationId: string;
    payload: Record<string, string | number | boolean | null>;
    tenantId: TenantId;
    type: string;
    version: number;
  },
) {
  const event: TenancyEvent = {
    actor: options.actor,
    aggregate: {
      id: options.aggregateId,
      type: options.aggregateType,
      version: options.version,
    },
    correlationId: options.correlationId,
    id: dependencies.ids.next(),
    occurredAt: dependencies.clock.now().toISOString(),
    payload: options.payload,
    tenantId: options.tenantId,
    type: options.type,
  };
  await tx.appendOutbox(event);
}
