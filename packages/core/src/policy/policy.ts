import type {
  ActionAccessibility,
  ActionConfirmation,
  ActionDecision,
  UiMeta,
  UiReason,
} from "../contracts";

export type PolicyDenialCode =
  | "ACTION_UNKNOWN"
  | "PERMISSION_NOT_GRANTED"
  | "PERMISSION_UNKNOWN"
  | "POLICY_REVISION_STALE";

export interface PolicyActionRule<Permission extends string> {
  readonly accessibility: ActionAccessibility;
  readonly confirmation?: ActionConfirmation;
  readonly intent?: "danger" | "primary" | "secondary";
  readonly permission: Permission;
  readonly presentation: "disabled" | "hidden";
}

export interface PolicyDefinition<Permission extends string> {
  readonly actions: Readonly<
    Record<string, PolicyActionRule<Permission> | undefined>
  >;
  readonly permissions: readonly Permission[];
  readonly revision: string;
}

export interface EvaluatePolicyOptions<
  Action extends string,
  Permission extends string,
> {
  readonly action: Action;
  readonly expectedRevision: string;
  readonly grantedPermissions: readonly Permission[];
  readonly policy: PolicyDefinition<Permission>;
}

export type PolicyDecision<Action extends string, Permission extends string> =
  | Readonly<{
      action: Action;
      allowed: true;
      permission: Permission;
      revision: string;
      status: "allowed";
    }>
  | Readonly<{
      action: Action;
      allowed: false;
      reason: UiReason<PolicyDenialCode>;
      revision: string;
      status: "denied";
    }>;

const DENIAL_REASONS: Readonly<
  Record<PolicyDenialCode, UiReason<PolicyDenialCode>>
> = {
  ACTION_UNKNOWN: {
    code: "ACTION_UNKNOWN",
    messageKey: "core.policy.actionUnknown",
  },
  PERMISSION_NOT_GRANTED: {
    code: "PERMISSION_NOT_GRANTED",
    messageKey: "core.policy.permissionNotGranted",
  },
  PERMISSION_UNKNOWN: {
    code: "PERMISSION_UNKNOWN",
    messageKey: "core.policy.permissionUnknown",
  },
  POLICY_REVISION_STALE: {
    code: "POLICY_REVISION_STALE",
    messageKey: "core.policy.revisionStale",
  },
};

export function evaluatePolicy<
  Action extends string,
  Permission extends string,
>(
  options: EvaluatePolicyOptions<Action, Permission>,
): PolicyDecision<Action, Permission> {
  if (options.expectedRevision !== options.policy.revision) {
    return deny(options, "POLICY_REVISION_STALE");
  }

  const rule = options.policy.actions[options.action];
  if (!rule) {
    return deny(options, "ACTION_UNKNOWN");
  }
  if (!options.policy.permissions.includes(rule.permission)) {
    return deny(options, "PERMISSION_UNKNOWN");
  }
  if (!options.grantedPermissions.includes(rule.permission)) {
    return deny(options, "PERMISSION_NOT_GRANTED");
  }

  return {
    action: options.action,
    allowed: true,
    permission: rule.permission,
    revision: options.policy.revision,
    status: "allowed",
  };
}

function deny<Action extends string, Permission extends string>(
  options: EvaluatePolicyOptions<Action, Permission>,
  code: PolicyDenialCode,
): PolicyDecision<Action, Permission> {
  return {
    action: options.action,
    allowed: false,
    reason: DENIAL_REASONS[code],
    revision: options.policy.revision,
    status: "denied",
  };
}

export interface BuildPolicyUiMetaOptions<
  Action extends string,
  Permission extends string,
> extends Omit<EvaluatePolicyOptions<Action, Permission>, "action"> {
  readonly actions: readonly Action[];
}

export function buildPolicyUiMeta<
  Action extends string,
  Permission extends string,
>(
  options: BuildPolicyUiMetaOptions<Action, Permission>,
): UiMeta<Action, PolicyDenialCode> {
  const allowedActions = {} as Record<Action, ActionDecision<PolicyDenialCode>>;

  for (const action of options.actions) {
    const rule = options.policy.actions[action];
    const decision = evaluatePolicy({ ...options, action });
    allowedActions[action] = toActionDecision(action, decision, rule);
  }

  return {
    allowedActions,
    revision: options.policy.revision,
  };
}

function toActionDecision<Action extends string, Permission extends string>(
  action: Action,
  decision: PolicyDecision<Action, Permission>,
  rule: PolicyActionRule<Permission> | undefined,
): ActionDecision<PolicyDenialCode> {
  const accessibility = rule?.accessibility ?? {
    labelKey: `core.policy.action.${action}`,
  };
  if (!decision.allowed) {
    return {
      accessibility,
      presentation: rule?.presentation ?? "hidden",
      reason: decision.reason,
      status: "denied",
    };
  }

  return {
    accessibility,
    ...(rule?.confirmation ? { confirmation: rule.confirmation } : {}),
    ...(rule?.intent ? { intent: rule.intent } : {}),
    status: "allowed",
  };
}
