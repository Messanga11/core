import type { JsonValue } from "../contracts";

export type FormFieldKind =
  | "async-select"
  | "boolean"
  | "date-range"
  | "email"
  | "file"
  | "multi-select"
  | "number"
  | "otp"
  | "password"
  | "phone"
  | "repeater"
  | "select"
  | "text"
  | "textarea";

export interface FormOption {
  readonly labelKey: string;
  readonly value: string;
}

export interface FormValidationRule {
  readonly code: string;
  readonly messageKey: string;
  readonly type:
    | "email"
    | "max"
    | "maxLength"
    | "min"
    | "minLength"
    | "required";
  readonly value?: number;
}

export interface FormCondition {
  readonly equals: JsonValue;
  readonly field: string;
}

export interface FormFieldDefinition {
  readonly accept?: readonly string[];
  readonly condition?: FormCondition;
  readonly fields?: readonly FormFieldDefinition[];
  readonly helperKey?: string;
  readonly id: string;
  readonly kind: FormFieldKind;
  readonly labelKey: string;
  readonly maxBytes?: number;
  readonly maxItems?: number;
  readonly minItems?: number;
  readonly name: string;
  readonly options?: readonly FormOption[];
  readonly optionsSource?: string;
  readonly placeholderKey?: string;
  readonly rules?: readonly FormValidationRule[];
}

export interface FormStepDefinition {
  readonly descriptionKey?: string;
  readonly fields: readonly FormFieldDefinition[];
  readonly id: string;
  readonly titleKey: string;
}

export interface FormDefinition {
  readonly id: string;
  readonly schemaVersion: number;
  readonly steps: readonly FormStepDefinition[];
  readonly submitLabelKey: string;
  readonly titleKey: string;
}

export type FormValues = Readonly<Record<string, JsonValue>>;

export interface FormSubmission {
  readonly formId: string;
  readonly idempotencyKey: string;
  readonly schemaVersion: number;
  readonly values: FormValues;
}
