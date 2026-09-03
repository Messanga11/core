import { describe, expect, it, vi } from "vitest";
import { createPostgresOidcTenantAccess } from "./oidc-tenant-access.js";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

describe("PostgreSQL OIDC tenant access", () => {
  it("authorizes only an active membership under RLS", async () => {
    const query = vi.fn(async (text: string) => ({
      rowCount: text.startsWith("SELECT 1 AS allowed") ? 1 : 0,
      rows: [],
    }));
    const client: SqlClientPort = { query: query as SqlClientPort["query"] };
    const pool: SqlPoolPort = {
      connect: async () => client,
      end: async () => undefined,
    };
    await expect(
      createPostgresOidcTenantAccess(pool).authorize({
        identityId: "actor_1",
        tenantId: "tenant-1",
      }),
    ).resolves.toBe(true);
    expect(query.mock.calls.some(([text]) => text.includes("set_config"))).toBe(
      true,
    );
  });

  it("denies malformed tenant hints without querying", async () => {
    const connect = vi.fn();
    const pool: SqlPoolPort = { connect, end: async () => undefined };
    await expect(
      createPostgresOidcTenantAccess(pool).authorize({
        identityId: "actor_1",
        tenantId: "../other",
      }),
    ).resolves.toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });
});
