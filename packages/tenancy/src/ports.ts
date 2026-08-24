import type { Invitation, Membership, Tenant, TenantId } from "./contracts.js";
import type { TenancyEvent } from "./events.js";

export interface InvitationCryptoPort {
  generateToken(bytes: 32): Promise<string>;
  hashToken(token: string): Promise<string>;
}

export interface TenancyTransaction {
  findTenant(tenantId: TenantId): Promise<Tenant | null>;
  findMembership(
    tenantId: TenantId,
    identityId: string,
  ): Promise<Membership | null>;
  findMembershipById(
    tenantId: TenantId,
    membershipId: string,
  ): Promise<Membership | null>;
  findInvitationById(
    tenantId: TenantId,
    invitationId: string,
  ): Promise<Invitation | null>;
  findInvitationByHash(
    tenantId: TenantId,
    tokenHash: string,
  ): Promise<Invitation | null>;
  insertTenant(tenant: Tenant): Promise<void>;
  saveTenant(tenant: Tenant, expectedVersion: number): Promise<boolean>;
  insertMembership(membership: Membership): Promise<void>;
  saveMembership(
    membership: Membership,
    expectedVersion: number,
  ): Promise<boolean>;
  removeMembership(
    tenantId: TenantId,
    membershipId: string,
    expectedVersion: number,
  ): Promise<boolean>;
  insertInvitation(invitation: Invitation): Promise<void>;
  saveInvitation(
    invitation: Invitation,
    expectedVersion: number,
  ): Promise<boolean>;
  countActiveOwners(tenantId: TenantId): Promise<number>;
  appendOutbox(event: TenancyEvent): Promise<void>;
  reserveIdempotency(tenantId: TenantId, key: string): Promise<boolean>;
}

export interface TenancyUnitOfWorkPort {
  withTenantTransaction<T>(
    tenantId: TenantId,
    work: (transaction: TenancyTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface TenancyClockPort {
  now(): Date;
}
export interface TenancyIdPort {
  next(): string;
}
