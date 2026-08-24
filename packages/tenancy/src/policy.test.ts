import { describe, expect, it } from "vitest";
import { MembershipSchema } from "./contracts.js";
import { createTenancyUiMeta, evaluateTenantPermission } from "./policy.js";

const membership = MembershipSchema.parse({
  id: "membership-1",
  identity: { id: "actor-1", kind: "human" },
  role: "viewer",
  status: "active",
  tenantId: "tenant-1",
  version: 3,
});

describe("tenancy policy", () => {
  it("derives server and UI decisions from the same effective permissions", () => {
    expect(
      evaluateTenantPermission({ membership, permission: "tenant.read" })
        .status,
    ).toBe("allowed");
    expect(
      createTenancyUiMeta(membership).allowedActions["tenant.members.invite"],
    ).toMatchObject({
      status: "denied",
      reason: { code: "PERMISSION_DENIED" },
    });
  });

  it("fails closed for stale revisions and inactive memberships", () => {
    expect(
      evaluateTenantPermission({
        expectedPolicyRevision: "2",
        membership,
        permission: "tenant.read",
      }),
    ).toMatchObject({
      status: "denied",
      reason: { code: "POLICY_REVISION_STALE" },
    });
    expect(
      evaluateTenantPermission({
        membership: { ...membership, status: "suspended" },
        permission: "tenant.read",
      }),
    ).toMatchObject({
      status: "denied",
      reason: { code: "MEMBERSHIP_INACTIVE" },
    });
  });

  it("accepts a current revision and denies a missing membership", () => {
    expect(
      evaluateTenantPermission({
        expectedPolicyRevision: "3",
        membership,
        permission: "tenant.read",
      }),
    ).toMatchObject({ status: "allowed" });
    expect(
      evaluateTenantPermission({
        membership: null,
        permission: "tenant.read",
      }),
    ).toMatchObject({
      status: "denied",
      reason: { code: "MEMBERSHIP_INACTIVE" },
    });
    expect(createTenancyUiMeta(null)).toMatchObject({ revision: "none" });
  });
});
