import { describe, expect, it } from "vitest";
import type { Invitation, Membership, Tenant, TenantId } from "./contracts.js";
import { TenancyError } from "./errors.js";
import type { TenancyEvent } from "./events.js";
import type { TenancyTransaction } from "./ports.js";
import { createTenancyService } from "./service.js";

const tenantId = "tenant-1" as TenantId;

class FakeTransaction implements TenancyTransaction {
  public tenant: Tenant | null = null;
  public memberships: Membership[] = [];
  public invitations: Invitation[] = [];
  public events: TenancyEvent[] = [];
  private readonly keys = new Set<string>();
  async findTenant(id: TenantId) {
    return this.tenant?.id === id ? this.tenant : null;
  }
  async findMembership(id: TenantId, identityId: string) {
    return (
      this.memberships.find(
        (item) => item.tenantId === id && item.identity.id === identityId,
      ) ?? null
    );
  }
  async findMembershipById(id: TenantId, membershipId: string) {
    return (
      this.memberships.find(
        (item) => item.tenantId === id && item.id === membershipId,
      ) ?? null
    );
  }
  async findInvitationById(id: TenantId, invitationId: string) {
    return (
      this.invitations.find(
        (item) => item.tenantId === id && item.id === invitationId,
      ) ?? null
    );
  }
  async findInvitationByHash(id: TenantId, tokenHash: string) {
    return (
      this.invitations.find(
        (item) => item.tenantId === id && item.tokenHash === tokenHash,
      ) ?? null
    );
  }
  async insertTenant(value: Tenant) {
    this.tenant = value;
  }
  async saveTenant(value: Tenant, expected: number) {
    if (this.tenant?.version !== expected) return false;
    this.tenant = value;
    return true;
  }
  async insertMembership(value: Membership) {
    this.memberships.push(value);
  }
  async saveMembership(value: Membership, expected: number) {
    const index = this.memberships.findIndex(
      (item) =>
        item.id === value.id &&
        item.tenantId === value.tenantId &&
        item.version === expected,
    );
    if (index < 0) return false;
    this.memberships[index] = value;
    return true;
  }
  async removeMembership(id: TenantId, membershipId: string, expected: number) {
    const index = this.memberships.findIndex(
      (item) =>
        item.id === membershipId &&
        item.tenantId === id &&
        item.version === expected,
    );
    if (index < 0) return false;
    this.memberships.splice(index, 1);
    return true;
  }
  async insertInvitation(value: Invitation) {
    this.invitations.push(value);
  }
  async saveInvitation(value: Invitation, expected: number) {
    const index = this.invitations.findIndex(
      (item) =>
        item.id === value.id &&
        item.tenantId === value.tenantId &&
        item.version === expected,
    );
    if (index < 0) return false;
    this.invitations[index] = value;
    return true;
  }
  async countActiveOwners(id: TenantId) {
    return this.memberships.filter(
      (item) =>
        item.tenantId === id &&
        item.role === "owner" &&
        item.status === "active",
    ).length;
  }
  async appendOutbox(event: TenancyEvent) {
    this.events.push(event);
  }
  async reserveIdempotency(_id: TenantId, key: string) {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
}

function setup() {
  const transaction = new FakeTransaction();
  let id = 0;
  const service = createTenancyService({
    clock: { now: () => new Date("2026-01-01T00:00:00.000Z") },
    crypto: {
      generateToken: async (bytes) =>
        `token-${bytes}-bytes-secure-value-0123456789abcdef`,
      hashToken: async (token) => `hash:${token}`,
    },
    ids: { next: () => `event-${++id}` },
    unitOfWork: {
      withTenantTransaction: async (_tenant, work) => work(transaction),
    },
  });
  return { service, transaction };
}

async function createOwner() {
  const context = setup();
  await context.service.createTenant({
    expectedVersion: 0,
    idempotencyKey: "create-tenant-key",
    membershipId: "membership-owner",
    name: "Acme",
    owner: { kind: "human", id: "owner-1" },
    tenantId,
  });
  return context;
}

describe("tenancy service", () => {
  it("creates a tenant, its owner, and an outbox event atomically", async () => {
    const { service, transaction } = setup();
    const result = await service.createTenant({
      expectedVersion: 0,
      idempotencyKey: "create-tenant-key",
      membershipId: "membership-owner",
      name: "Acme",
      owner: { kind: "human", id: "owner-1" },
      tenantId,
    });
    expect(result.tenant).toMatchObject({
      id: tenantId,
      status: "active",
      version: 1,
    });
    expect(transaction.memberships[0]).toMatchObject({
      role: "owner",
      tenantId,
    });
    expect(transaction.events[0]?.type).toBe("tenancy.tenant.created.v1");
  });

  it("stores only a hash and returns the invitation token once", async () => {
    const { service, transaction } = await createOwner();
    const result = await service.inviteMember({
      actor: { kind: "human", id: "owner-1" },
      email: "new@example.com",
      expectedVersion: 1,
      idempotencyKey: "invite-member-key",
      invitationId: "invite-1",
      role: "member",
      tenantId,
    });
    expect(result.token).toContain("token-32-bytes");
    expect(transaction.invitations[0]?.tokenHash).toBe(`hash:${result.token}`);
    expect(JSON.stringify(transaction.events)).not.toContain("new@example.com");
    expect(JSON.stringify(transaction.events)).not.toContain(result.token);
  });

  it("rejects tenant spoofing and invitation replay", async () => {
    const { service } = await createOwner();
    await expect(
      service.inviteMember({
        actor: { kind: "human", id: "owner-1" },
        email: "new@example.com",
        expectedVersion: 1,
        idempotencyKey: "spoofed-tenant-key",
        invitationId: "invite-1",
        role: "member",
        tenantId: "other-tenant" as TenantId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const command = {
      actor: { kind: "human" as const, id: "owner-1" },
      email: "new@example.com",
      expectedVersion: 1,
      idempotencyKey: "invite-member-key",
      invitationId: "invite-1",
      role: "member" as const,
      tenantId,
    };
    await service.inviteMember(command);
    await expect(service.inviteMember(command)).rejects.toEqual(
      new TenancyError("REPLAYED"),
    );
  });

  it("prevents suspending the last active owner", async () => {
    const { service } = await createOwner();
    await expect(
      service.suspendMembership({
        actor: { kind: "human", id: "owner-1" },
        expectedVersion: 1,
        idempotencyKey: "suspend-owner-key",
        membershipId: "membership-owner",
        tenantId,
      }),
    ).rejects.toMatchObject({ code: "LAST_OWNER" });
  });

  it("accepts a valid invitation once and rejects its replay", async () => {
    const { service } = await createOwner();
    const invited = await service.inviteMember({
      actor: { kind: "human", id: "owner-1" },
      email: "new@example.com",
      expectedVersion: 1,
      idempotencyKey: "invite-accept-key",
      invitationId: "invite-1",
      role: "member",
      tenantId,
    });
    const command = {
      actor: { kind: "human" as const, id: "new-member" },
      expectedVersion: 2,
      idempotencyKey: "accept-member-key",
      invitationToken: invited.token,
      membershipId: "membership-new",
      tenantId,
    };
    await expect(service.acceptInvitation(command)).resolves.toMatchObject({
      role: "member",
      tenantId,
    });
    await expect(
      service.acceptInvitation({
        ...command,
        expectedVersion: 3,
        idempotencyKey: "accept-replay-key",
      }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("reissues and revokes an unused invitation", async () => {
    const { service, transaction } = await createOwner();
    await service.inviteMember({
      actor: { kind: "human", id: "owner-1" },
      email: "new@example.com",
      expectedVersion: 1,
      idempotencyKey: "invite-reissue-key",
      invitationId: "invite-1",
      role: "admin",
      tenantId,
    });
    const reissued = await service.reinviteMember({
      actor: { kind: "human", id: "owner-1" },
      expectedVersion: 2,
      idempotencyKey: "reissue-member-key",
      invitationId: "invite-1",
      tenantId,
    });
    expect(reissued.invitation.version).toBe(2);
    await expect(
      service.revokeInvitation({
        actor: { kind: "human", id: "owner-1" },
        expectedVersion: 3,
        idempotencyKey: "revoke-member-key",
        invitationId: "invite-1",
        tenantId,
      }),
    ).resolves.toMatchObject({ revokedAt: "2026-01-01T00:00:00.000Z" });
    expect(transaction.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "tenancy.invitation.reissued.v1",
        "tenancy.invitation.revoked.v1",
      ]),
    );
  });

  it("changes, suspends, and removes a tenant-scoped membership", async () => {
    const { service, transaction } = await createOwner();
    transaction.memberships.push({
      id: "membership-2" as Membership["id"],
      identity: {
        kind: "service",
        id: "service-1" as Membership["identity"]["id"],
      },
      role: "member",
      status: "active",
      tenantId,
      version: 1,
    });
    await expect(
      service.changeMembership({
        actor: { kind: "human", id: "owner-1" },
        expectedVersion: 1,
        idempotencyKey: "change-member-key",
        membershipId: "membership-2",
        role: "admin",
        tenantId,
      }),
    ).resolves.toMatchObject({ role: "admin" });
    await expect(
      service.suspendMembership({
        actor: { kind: "human", id: "owner-1" },
        expectedVersion: 2,
        idempotencyKey: "suspend-member-key",
        membershipId: "membership-2",
        tenantId,
      }),
    ).resolves.toMatchObject({ status: "suspended" });
    await service.removeMembership({
      actor: { kind: "human", id: "owner-1" },
      expectedVersion: 3,
      idempotencyKey: "remove-member-key",
      membershipId: "membership-2",
      tenantId,
    });
    expect(transaction.memberships).toHaveLength(1);
  });

  it("transfers ownership without leaving the tenant ownerless", async () => {
    const { service, transaction } = await createOwner();
    transaction.memberships.push({
      id: "membership-2" as Membership["id"],
      identity: {
        kind: "human",
        id: "actor-2" as Membership["identity"]["id"],
      },
      role: "admin",
      status: "active",
      tenantId,
      version: 1,
    });
    const result = await service.transferOwnership({
      actor: { kind: "human", id: "owner-1" },
      expectedVersion: 1,
      idempotencyKey: "transfer-owner-key",
      membershipId: "membership-owner",
      newOwnerMembershipId: "membership-2",
      tenantId,
    });
    expect(result).toMatchObject({
      newOwner: { role: "owner" },
      previousOwner: { role: "admin" },
    });
    expect(await transaction.countActiveOwners(tenantId)).toBe(1);
  });

  it("suspends a tenant and rejects stale aggregate revisions", async () => {
    const { service } = await createOwner();
    await expect(
      service.suspendTenant({
        actor: { kind: "human", id: "owner-1" },
        expectedVersion: 0,
        idempotencyKey: "stale-suspend-key",
        tenantId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.suspendTenant({
        actor: { kind: "human", id: "owner-1" },
        expectedVersion: 1,
        idempotencyKey: "valid-suspend-key",
        tenantId,
      }),
    ).resolves.toMatchObject({ status: "suspended", version: 2 });
  });

  it("denies mutations when the actor lacks the effective permission", async () => {
    const { service, transaction } = await createOwner();
    const owner = transaction.memberships[0];
    if (!owner) throw new Error("owner fixture missing");
    transaction.memberships[0] = { ...owner, role: "viewer" };
    await expect(
      service.inviteMember({
        actor: { kind: "human", id: "owner-1" },
        email: "new@example.com",
        expectedVersion: 1,
        idempotencyKey: "forbidden-invite-key",
        invitationId: "invite-1",
        role: "member",
        tenantId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
