import type { TenantId } from "@messanga11/tenancy";
import { describe, expect, it } from "vitest";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";
import { createPostgresTenancyUnitOfWork } from "./unit-of-work.js";

class FakeClient implements SqlClientPort {
  public readonly calls: Array<{ text: string; values?: readonly unknown[] }> =
    [];
  public released = false;
  public async query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) {
    this.calls.push(values ? { text, values } : { text });
    if (text.startsWith("SELECT id, name"))
      return {
        rowCount: 1,
        rows: [
          { id: "tenant-1", name: "Acme", status: "active", version: "1" },
        ] as unknown as Row[],
      };
    if (text.includes("FROM memberships WHERE"))
      return {
        rowCount: 1,
        rows: [
          {
            id: "membership-1",
            tenant_id: "tenant-1",
            identity_id: "actor-1",
            identity_kind: "human",
            role: "owner",
            status: "active",
            version: "1",
          },
        ] as unknown as Row[],
      };
    if (text.includes("FROM invitations WHERE"))
      return {
        rowCount: 1,
        rows: [
          {
            accepted_at: null,
            email: "person@example.com",
            expires_at: new Date("2027-01-01T00:00:00.000Z"),
            id: "invite-1",
            revoked_at: null,
            role: "member",
            tenant_id: "tenant-1",
            token_hash: "hash-value-with-at-least-thirty-two-characters",
            version: "1",
          },
        ] as unknown as Row[],
      };
    if (text.startsWith("SELECT count"))
      return { rowCount: 1, rows: [{ count: "1" }] as unknown as Row[] };
    if (text.includes("RETURNING key"))
      return {
        rowCount: 1,
        rows: [{ key: "idempotency-key" }] as unknown as Row[],
      };
    return {
      rowCount:
        text === "BEGIN" ||
        text === "COMMIT" ||
        text === "ROLLBACK" ||
        text.startsWith("SELECT")
          ? 0
          : 1,
      rows: [] as Row[],
    };
  }
  public release() {
    this.released = true;
  }
}

function setup() {
  const client = new FakeClient();
  const pool: SqlPoolPort = {
    connect: async () => client,
    end: async () => undefined,
  };
  return { client, unitOfWork: createPostgresTenancyUnitOfWork(pool) };
}

describe("Postgres tenancy unit of work", () => {
  it("sets tenant scope, parameterizes input, and commits", async () => {
    const { client, unitOfWork } = setup();
    const hostile = "tenant'; DROP TABLE tenants; --" as TenantId;
    await unitOfWork.withTenantTransaction(hostile, async (transaction) =>
      transaction.findTenant(hostile),
    );
    expect(client.calls.some((call) => call.values?.includes(hostile))).toBe(
      true,
    );
    expect(client.calls.every((call) => !call.text.includes(hostile))).toBe(
      true,
    );
    expect(client.calls.map((call) => call.text)).toEqual(
      expect.arrayContaining(["BEGIN", "COMMIT"]),
    );
    expect(client.released).toBe(true);
  });

  it("rolls back and preserves the original error", async () => {
    const { client, unitOfWork } = setup();
    const failure = new Error("failure");
    await expect(
      unitOfWork.withTenantTransaction("tenant-1" as TenantId, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(client.calls.at(-1)?.text).toBe("ROLLBACK");
  });

  it("maps domain records and keeps every repository mutation tenant-scoped", async () => {
    const { client, unitOfWork } = setup();
    const id = "tenant-1" as TenantId;
    await unitOfWork.withTenantTransaction(id, async (transaction) => {
      const tenant = await transaction.findTenant(id);
      const membership = await transaction.findMembership(id, "actor-1");
      const invitation = await transaction.findInvitationByHash(
        id,
        "hash-value-with-at-least-thirty-two-characters",
      );
      expect({ invitation, membership, tenant }).toMatchObject({
        invitation: { id: "invite-1" },
        membership: { id: "membership-1" },
        tenant: { id },
      });
      if (!tenant || !membership || !invitation)
        throw new Error("fixtures missing");
      await transaction.findMembershipById(id, membership.id);
      await transaction.findInvitationById(id, invitation.id);
      await transaction.insertTenant(tenant);
      await transaction.saveTenant({ ...tenant, version: 2 }, 1);
      await transaction.insertMembership(membership);
      await transaction.saveMembership({ ...membership, version: 2 }, 1);
      await transaction.removeMembership(id, membership.id, 2);
      await transaction.insertInvitation(invitation);
      await transaction.saveInvitation({ ...invitation, version: 2 }, 1);
      await transaction.countActiveOwners(id);
      await transaction.appendOutbox({
        actor: membership.identity,
        aggregate: { id, type: "tenant", version: 1 },
        correlationId: "correlation-1",
        id: "event-1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: {},
        tenantId: id,
        type: "tenancy.tenant.created.v1",
      });
      await transaction.reserveIdempotency(id, "idempotency-key");
    });
    const repositoryCalls = client.calls.filter((call) =>
      /memberships|invitations|outbox|idempotency_keys/.test(call.text),
    );
    expect(repositoryCalls.every((call) => call.values?.includes(id))).toBe(
      true,
    );
  });
});
