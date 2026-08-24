import type { CorePublicError } from "./public-error";

export interface UiReason<Code extends string = string> {
  readonly code: Code;
  readonly messageKey: string;
  readonly params?: Readonly<Record<string, number | string>>;
}

export interface ActionAccessibility {
  readonly labelKey: string;
  readonly hintKey?: string;
}

export interface ActionConfirmation {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly confirmLabelKey: string;
}

export interface AllowedActionDecision {
  readonly status: "allowed";
  readonly accessibility: ActionAccessibility;
  readonly intent?: "danger" | "primary" | "secondary";
  readonly confirmation?: ActionConfirmation;
}

export interface DeniedActionDecision<Reason extends string = string> {
  readonly status: "denied";
  readonly accessibility: ActionAccessibility;
  readonly presentation: "disabled" | "hidden";
  readonly reason: UiReason<Reason>;
}

export type ActionDecision<Reason extends string = string> =
  | AllowedActionDecision
  | DeniedActionDecision<Reason>;

export interface UiMeta<Action extends string, Reason extends string = string> {
  readonly revision: string;
  readonly allowedActions: Readonly<Record<Action, ActionDecision<Reason>>>;
}

const MISSING_ACTION_REASON: UiReason<"ACTION_METADATA_MISSING"> = {
  code: "ACTION_METADATA_MISSING",
  messageKey: "core.action.metadataMissing",
};

export class ActionNotAllowedError extends Error {
  public readonly action: string;
  public readonly code = "ACTION_NOT_ALLOWED" as const;
  public readonly reason: UiReason;

  public constructor(action: string, reason: UiReason) {
    super("The requested action is not allowed.");
    this.name = "ActionNotAllowedError";
    this.action = action;
    this.reason = reason;
  }

  public toJSON(): CorePublicError<"ACTION_NOT_ALLOWED"> {
    return {
      code: this.code,
      messageKey: this.reason.messageKey,
      retryable: false,
      details: {
        action: this.action,
        reasonCode: this.reason.code,
      },
    };
  }
}

function getDecision<Action extends string, Reason extends string>(
  meta: UiMeta<Action, Reason>,
  action: Action,
): ActionDecision<Reason> | undefined {
  const decisions: Readonly<
    Record<string, ActionDecision<Reason> | undefined>
  > = meta.allowedActions;

  return decisions[action];
}

export function canPerform<Action extends string, Reason extends string>(
  meta: UiMeta<Action, Reason>,
  action: Action,
): boolean {
  return getDecision(meta, action)?.status === "allowed";
}

export function getDenial<Action extends string, Reason extends string>(
  meta: UiMeta<Action, Reason>,
  action: Action,
): UiReason<Reason> | undefined {
  const decision = getDecision(meta, action);
  return decision?.status === "denied" ? decision.reason : undefined;
}

export function assertAllowed<Action extends string, Reason extends string>(
  meta: UiMeta<Action, Reason>,
  action: Action,
): AllowedActionDecision {
  const decision = getDecision(meta, action);

  if (decision?.status === "allowed") {
    return decision;
  }

  throw new ActionNotAllowedError(
    action,
    decision?.reason ?? MISSING_ACTION_REASON,
  );
}
