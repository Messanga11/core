import type { ActionDecision, UiMeta } from "@messanga11/core";
import type { Membership } from "./contracts.js";
import {
  permissionsForRole,
  TENANT_PERMISSIONS,
  type TenantPermission,
} from "./permissions.js";

export type TenancyPolicyReason =
  | "MEMBERSHIP_INACTIVE"
  | "PERMISSION_DENIED"
  | "POLICY_REVISION_STALE";

const accessibility = (permission: TenantPermission) => ({
  labelKey: `tenancy.action.${permission}`,
});

export function evaluateTenantPermission(options: {
  membership: Membership | null;
  permission: TenantPermission;
  expectedPolicyRevision?: string;
}): ActionDecision<TenancyPolicyReason> {
  const revision = options.membership
    ? String(options.membership.version)
    : "none";
  if (
    options.expectedPolicyRevision !== undefined &&
    options.expectedPolicyRevision !== revision
  ) {
    return denied(options.permission, "POLICY_REVISION_STALE");
  }
  if (options.membership?.status !== "active") {
    return denied(options.permission, "MEMBERSHIP_INACTIVE");
  }
  return permissionsForRole(options.membership.role).has(options.permission)
    ? { status: "allowed", accessibility: accessibility(options.permission) }
    : denied(options.permission, "PERMISSION_DENIED");
}

export function createTenancyUiMeta(
  membership: Membership | null,
): UiMeta<TenantPermission, TenancyPolicyReason> {
  return {
    revision: membership ? String(membership.version) : "none",
    allowedActions: Object.fromEntries(
      TENANT_PERMISSIONS.map((permission) => [
        permission,
        evaluateTenantPermission({ membership, permission }),
      ]),
    ) as Record<TenantPermission, ActionDecision<TenancyPolicyReason>>,
  };
}

function denied(
  permission: TenantPermission,
  code: TenancyPolicyReason,
): ActionDecision<TenancyPolicyReason> {
  return {
    status: "denied",
    accessibility: accessibility(permission),
    presentation: code === "MEMBERSHIP_INACTIVE" ? "hidden" : "disabled",
    reason: { code, messageKey: `tenancy.policy.${code.toLowerCase()}` },
  };
}
