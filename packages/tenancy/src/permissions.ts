import type { TenantRole } from "./contracts.js";

export const TENANT_PERMISSIONS = [
  "tenant.read",
  "tenant.suspend",
  "tenant.members.invite",
  "tenant.members.manage",
  "tenant.members.remove",
  "tenant.ownership.transfer",
] as const;
export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, readonly TenantPermission[]>
> = {
  owner: TENANT_PERMISSIONS,
  admin: [
    "tenant.read",
    "tenant.members.invite",
    "tenant.members.manage",
    "tenant.members.remove",
  ],
  member: ["tenant.read"],
  viewer: ["tenant.read"],
};

export function permissionsForRole(
  role: TenantRole,
): ReadonlySet<TenantPermission> {
  return new Set(ROLE_PERMISSIONS[role]);
}
