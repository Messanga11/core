import type { OidcTenantAccessPort } from "@messanga11/auth-oidc/server";
import type { SqlPoolPort } from "./sql.js";

export function createPostgresOidcTenantAccess(
  pool: SqlPoolPort,
): OidcTenantAccessPort {
  return Object.freeze({
    authorize: async (
      options: Parameters<OidcTenantAccessPort["authorize"]>[0],
    ) => {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(options.tenantId)) return false;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(options.identityId)) return false;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          options.tenantId,
        ]);
        const result = await client.query(
          "SELECT 1 AS allowed FROM memberships WHERE tenant_id = $1 AND identity_id = $2 AND status = 'active' LIMIT 1",
          [options.tenantId, options.identityId],
        );
        await client.query("COMMIT");
        return result.rowCount === 1;
      } catch {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Authorization remains denied when rollback also fails.
        }
        return false;
      } finally {
        client.release?.();
      }
    },
  });
}
