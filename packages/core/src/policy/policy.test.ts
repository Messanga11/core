import { describe, expect, it } from "vitest";

import { buildPolicyUiMeta, evaluatePolicy } from "./index";

const POLICY = {
  actions: {
    archive: {
      accessibility: { labelKey: "project.archive.label" },
      intent: "danger",
      permission: "project.archive",
      presentation: "disabled",
    },
    rename: {
      accessibility: { labelKey: "project.rename.label" },
      intent: "primary",
      permission: "project.rename",
      presentation: "disabled",
    },
  },
  permissions: ["project.archive", "project.rename"],
  revision: "policy:2",
} as const;

describe("policy evaluation", () => {
  it("uses the same allowed decision for enforcement and uiMeta", () => {
    const input = {
      action: "rename",
      expectedRevision: "policy:2",
      grantedPermissions: ["project.rename"],
      policy: POLICY,
    } as const;

    const decision = evaluatePolicy(input);
    const uiMeta = buildPolicyUiMeta({
      ...input,
      actions: ["rename"],
    });

    expect(decision).toEqual({
      action: "rename",
      allowed: true,
      permission: "project.rename",
      revision: "policy:2",
      status: "allowed",
    });
    expect(uiMeta.allowedActions.rename).toEqual({
      accessibility: { labelKey: "project.rename.label" },
      intent: "primary",
      status: "allowed",
    });
  });

  it("denies an action missing from the policy", () => {
    const decision = evaluatePolicy({
      action: "delete",
      expectedRevision: "policy:2",
      grantedPermissions: ["project.rename"],
      policy: POLICY,
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: { code: "ACTION_UNKNOWN" },
      status: "denied",
    });
  });

  it("fails closed when an action references an unknown permission", () => {
    const decision = evaluatePolicy({
      action: "rename",
      expectedRevision: "policy:2",
      grantedPermissions: ["project.rename"],
      policy: {
        ...POLICY,
        permissions: ["project.archive"],
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: { code: "PERMISSION_UNKNOWN" },
      status: "denied",
    });
  });

  it("denies every ui action when the expected policy revision is stale", () => {
    const uiMeta = buildPolicyUiMeta({
      actions: ["archive", "rename"],
      expectedRevision: "policy:1",
      grantedPermissions: ["project.archive", "project.rename"],
      policy: POLICY,
    });

    expect(uiMeta.allowedActions.archive).toMatchObject({
      reason: { code: "POLICY_REVISION_STALE" },
      status: "denied",
    });
    expect(uiMeta.allowedActions.rename).toMatchObject({
      reason: { code: "POLICY_REVISION_STALE" },
      status: "denied",
    });
  });

  it("returns a serializable denial when permission is not granted", () => {
    const decision = evaluatePolicy({
      action: "archive",
      expectedRevision: "policy:2",
      grantedPermissions: [],
      policy: POLICY,
    });

    expect(JSON.parse(JSON.stringify(decision))).toMatchObject({
      allowed: false,
      reason: { code: "PERMISSION_NOT_GRANTED" },
      status: "denied",
    });
  });

  it("builds safe hidden metadata for an unregistered action", () => {
    const uiMeta = buildPolicyUiMeta({
      actions: ["delete"],
      expectedRevision: "policy:2",
      grantedPermissions: [],
      policy: POLICY,
    });

    expect(uiMeta.allowedActions.delete).toEqual({
      accessibility: { labelKey: "core.policy.action.delete" },
      presentation: "hidden",
      reason: {
        code: "ACTION_UNKNOWN",
        messageKey: "core.policy.actionUnknown",
      },
      status: "denied",
    });
  });

  it("preserves confirmation metadata without inventing an intent", () => {
    const uiMeta = buildPolicyUiMeta({
      actions: ["view"],
      expectedRevision: "policy:1",
      grantedPermissions: ["project.view"],
      policy: {
        actions: {
          view: {
            accessibility: { labelKey: "project.view.label" },
            confirmation: {
              bodyKey: "project.view.confirm.body",
              confirmLabelKey: "project.view.confirm.action",
              titleKey: "project.view.confirm.title",
            },
            permission: "project.view",
            presentation: "hidden",
          },
        },
        permissions: ["project.view"],
        revision: "policy:1",
      },
    });

    expect(uiMeta.allowedActions.view).toMatchObject({
      confirmation: { titleKey: "project.view.confirm.title" },
      status: "allowed",
    });
    expect(uiMeta.allowedActions.view).not.toHaveProperty("intent");
  });
});
