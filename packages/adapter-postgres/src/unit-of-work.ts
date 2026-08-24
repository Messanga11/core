import {
  type Invitation,
  InvitationSchema,
  type Membership,
  MembershipSchema,
  type TenancyEvent,
  type TenancyTransaction,
  type TenancyUnitOfWorkPort,
  type Tenant,
  type TenantId,
  TenantSchema,
} from "@messanga11/tenancy";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

export function createPostgresTenancyUnitOfWork(
  pool: SqlPoolPort,
): TenancyUnitOfWorkPort {
  return {
    async withTenantTransaction<T>(
      tenantId: TenantId,
      work: (transaction: TenancyTransaction) => Promise<T>,
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [tenantId],
        );
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenantId,
        ]);
        const result = await work(new PostgresTenancyTransaction(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release?.();
      }
    },
  };
}

class PostgresTenancyTransaction implements TenancyTransaction {
  public constructor(private readonly client: SqlClientPort) {}

  public async findTenant(tenantId: TenantId) {
    const result = await this.client.query(
      "SELECT id, name, status, version FROM tenants WHERE id = $1",
      [tenantId],
    );
    return result.rows[0] ? TenantSchema.parse(toCamel(result.rows[0])) : null;
  }

  public async findMembership(tenantId: TenantId, identityId: string) {
    return this.readMembership(
      "SELECT id, tenant_id, identity_id, identity_kind, role, status, version FROM memberships WHERE tenant_id = $1 AND identity_id = $2",
      [tenantId, identityId],
    );
  }

  public async findMembershipById(tenantId: TenantId, membershipId: string) {
    return this.readMembership(
      "SELECT id, tenant_id, identity_id, identity_kind, role, status, version FROM memberships WHERE tenant_id = $1 AND id = $2",
      [tenantId, membershipId],
    );
  }

  public async findInvitationById(tenantId: TenantId, invitationId: string) {
    return this.readInvitation(
      "SELECT id, tenant_id, email, role, token_hash, expires_at, revoked_at, accepted_at, version FROM invitations WHERE tenant_id = $1 AND id = $2",
      [tenantId, invitationId],
    );
  }

  public async findInvitationByHash(tenantId: TenantId, tokenHash: string) {
    return this.readInvitation(
      "SELECT id, tenant_id, email, role, token_hash, expires_at, revoked_at, accepted_at, version FROM invitations WHERE tenant_id = $1 AND token_hash = $2",
      [tenantId, tokenHash],
    );
  }

  public async insertTenant(tenant: Tenant) {
    await this.client.query(
      "INSERT INTO tenants (id, name, status, version) VALUES ($1, $2, $3, $4)",
      [tenant.id, tenant.name, tenant.status, tenant.version],
    );
  }

  public async saveTenant(tenant: Tenant, expectedVersion: number) {
    const result = await this.client.query(
      "UPDATE tenants SET name = $3, status = $4, version = $5 WHERE id = $1 AND version = $2",
      [tenant.id, expectedVersion, tenant.name, tenant.status, tenant.version],
    );
    return result.rowCount === 1;
  }

  public async insertMembership(membership: Membership) {
    await this.client.query(
      "INSERT INTO memberships (tenant_id, id, identity_id, identity_kind, role, status, version) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        membership.tenantId,
        membership.id,
        membership.identity.id,
        membership.identity.kind,
        membership.role,
        membership.status,
        membership.version,
      ],
    );
  }

  public async saveMembership(membership: Membership, expectedVersion: number) {
    const result = await this.client.query(
      "UPDATE memberships SET role = $4, status = $5, version = $6 WHERE tenant_id = $1 AND id = $2 AND version = $3",
      [
        membership.tenantId,
        membership.id,
        expectedVersion,
        membership.role,
        membership.status,
        membership.version,
      ],
    );
    return result.rowCount === 1;
  }

  public async removeMembership(
    tenantId: TenantId,
    membershipId: string,
    expectedVersion: number,
  ) {
    const result = await this.client.query(
      "DELETE FROM memberships WHERE tenant_id = $1 AND id = $2 AND version = $3",
      [tenantId, membershipId, expectedVersion],
    );
    return result.rowCount === 1;
  }

  public async insertInvitation(invitation: Invitation) {
    await this.client.query(
      "INSERT INTO invitations (tenant_id, id, email, role, token_hash, expires_at, revoked_at, accepted_at, version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      invitationValues(invitation),
    );
  }

  public async saveInvitation(invitation: Invitation, expectedVersion: number) {
    const result = await this.client.query(
      "UPDATE invitations SET email = $4, role = $5, token_hash = $6, expires_at = $7, revoked_at = $8, accepted_at = $9, version = $10 WHERE tenant_id = $1 AND id = $2 AND version = $3",
      [
        invitation.tenantId,
        invitation.id,
        expectedVersion,
        invitation.email,
        invitation.role,
        invitation.tokenHash,
        invitation.expiresAt,
        invitation.revokedAt,
        invitation.acceptedAt,
        invitation.version,
      ],
    );
    return result.rowCount === 1;
  }

  public async countActiveOwners(tenantId: TenantId) {
    const result = await this.client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM memberships WHERE tenant_id = $1 AND role = 'owner' AND status = 'active'",
      [tenantId],
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async appendOutbox(event: TenancyEvent) {
    await this.client.query(
      "INSERT INTO outbox (tenant_id, event_id, event_type, payload, occurred_at) VALUES ($1, $2, $3, $4::jsonb, $5)",
      [
        event.tenantId,
        event.id,
        event.type,
        JSON.stringify(event),
        event.occurredAt,
      ],
    );
  }

  public async reserveIdempotency(tenantId: TenantId, key: string) {
    const result = await this.client.query(
      "INSERT INTO idempotency_keys (tenant_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key",
      [tenantId, key],
    );
    return result.rowCount === 1;
  }

  private async readMembership(text: string, values: readonly unknown[]) {
    const result = await this.client.query(text, values);
    const row = result.rows[0];
    if (!row) return null;
    return MembershipSchema.parse({
      id: row.id,
      identity: { id: row.identity_id, kind: row.identity_kind },
      role: row.role,
      status: row.status,
      tenantId: row.tenant_id,
      version: Number(row.version),
    });
  }

  private async readInvitation(text: string, values: readonly unknown[]) {
    const result = await this.client.query(text, values);
    const row = result.rows[0];
    if (!row) return null;
    return InvitationSchema.parse({
      acceptedAt: toIso(row.accepted_at),
      email: row.email,
      expiresAt: toIso(row.expires_at),
      id: row.id,
      revokedAt: toIso(row.revoked_at),
      role: row.role,
      tenantId: row.tenant_id,
      tokenHash: row.token_hash,
      version: Number(row.version),
    });
  }
}

function invitationValues(value: Invitation) {
  return [
    value.tenantId,
    value.id,
    value.email,
    value.role,
    value.tokenHash,
    value.expiresAt,
    value.revokedAt,
    value.acceptedAt,
    value.version,
  ];
}
function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    version: Number(row.version),
  };
}
function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
async function rollback(client: SqlClientPort) {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* Preserve the original transactional failure. */
  }
}
