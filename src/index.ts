export const CORE_PACKAGE_NAME = "@messanga11/core" as const;

export type {
  ActionAccessibility,
  ActionConfirmation,
  ActionDecision,
  AllowedActionDecision,
  CorePublicError,
  DeniedActionDecision,
  JsonPrimitive,
  JsonValue,
  OperationEnvelope,
  UiAnnouncement,
  UiFeedback,
  UiMeta,
  UiReason,
  UiRuntimeAdapter,
} from "./contracts";
export {
  ActionNotAllowedError,
  assertAllowed,
  canPerform,
  getDenial,
} from "./contracts";
