import type { UiMeta } from "@messanga11/core";
import {
  buildPolicyUiMeta,
  evaluatePolicy,
  type PolicyDenialCode,
} from "@messanga11/core/policy";
import type { AuthorizationPort, Permission } from "@messanga11/core/server";

export const PROJECT_ACTIONS = ["archive", "create", "read", "rename"] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];
export type ProjectPermission = `project:${ProjectAction}`;

export const PROJECT_POLICY = {
  actions: {
    archive: {
      accessibility: { labelKey: "project.archive.label" },
      confirmation: {
        bodyKey: "project.archive.confirm.body",
        confirmLabelKey: "project.archive.confirm.action",
        titleKey: "project.archive.confirm.title",
      },
      intent: "danger",
      permission: "project:archive",
      presentation: "disabled",
    },
    create: {
      accessibility: { labelKey: "project.create.label" },
      intent: "primary",
      permission: "project:create",
      presentation: "disabled",
    },
    read: {
      accessibility: { labelKey: "project.read.label" },
      permission: "project:read",
      presentation: "hidden",
    },
    rename: {
      accessibility: { labelKey: "project.rename.label" },
      intent: "primary",
      permission: "project:rename",
      presentation: "disabled",
    },
  },
  permissions: PROJECT_ACTIONS.map((action) => `project:${action}` as const),
  revision: "project-policy:1",
} as const;

export function buildProjectUiMeta(
  grantedPermissions: readonly ProjectPermission[],
): UiMeta<ProjectAction, PolicyDenialCode> {
  return buildPolicyUiMeta({
    actions: PROJECT_ACTIONS,
    expectedRevision: PROJECT_POLICY.revision,
    grantedPermissions,
    policy: PROJECT_POLICY,
  });
}

export function createProjectAuthorizationPort(
  grantedPermissions: readonly ProjectPermission[],
): AuthorizationPort {
  return {
    async authorize({ permission }) {
      const action = actionForPermission(permission);
      if (!action) {
        return { allowed: false };
      }
      return {
        allowed: evaluatePolicy({
          action,
          expectedRevision: PROJECT_POLICY.revision,
          grantedPermissions,
          policy: PROJECT_POLICY,
        }).allowed,
      };
    },
  };
}

function actionForPermission(
  permission: Permission,
): ProjectAction | undefined {
  return PROJECT_ACTIONS.find((action) => `project:${action}` === permission);
}
