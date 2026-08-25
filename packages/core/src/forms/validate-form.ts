import type {
  FormDefinition,
  FormFieldDefinition,
  FormValidationRule,
  FormValues,
} from "./form-definition";
import type { FormIssue } from "./form-state";

export type FormValidationResult =
  | Readonly<{ data: FormValues; success: true }>
  | Readonly<{ issues: readonly FormIssue[]; success: false }>;

export function validateFormValues(
  definition: FormDefinition,
  values: FormValues,
): FormValidationResult {
  const issues: FormIssue[] = [];
  for (const step of definition.steps) {
    validateFields(step.fields, values, issues, 0);
  }
  return issues.length === 0
    ? { data: values, success: true }
    : { issues, success: false };
}

function validateFields(
  fields: readonly FormFieldDefinition[],
  values: FormValues,
  issues: FormIssue[],
  depth: number,
): void {
  if (depth > 4) {
    return;
  }
  for (const field of fields) {
    if (!isVisible(field, values)) {
      continue;
    }
    const value = values[field.name];
    for (const rule of field.rules ?? []) {
      const issue = evaluateRule(field, rule, value);
      if (issue) {
        issues.push(issue);
      }
    }
    if (field.fields) {
      validateFields(field.fields, values, issues, depth + 1);
    }
  }
}

function isVisible(field: FormFieldDefinition, values: FormValues): boolean {
  const condition = field.condition;
  return (
    condition === undefined || values[condition.field] === condition.equals
  );
}

function evaluateRule(
  field: FormFieldDefinition,
  rule: FormValidationRule,
  value: FormValues[string] | undefined,
): FormIssue | undefined {
  if (rule.type === "required" && isEmpty(value)) {
    return createIssue(field, rule);
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  if (rule.type === "email" && (typeof value !== "string" || !isEmail(value))) {
    return createIssue(field, rule);
  }
  if (rule.type === "minLength" && getLength(value) < (rule.value ?? 0)) {
    return createIssue(field, rule);
  }
  if (rule.type === "maxLength" && getLength(value) > (rule.value ?? 0)) {
    return createIssue(field, rule);
  }
  if (
    rule.type === "min" &&
    typeof value === "number" &&
    value < (rule.value ?? 0)
  ) {
    return createIssue(field, rule);
  }
  if (
    rule.type === "max" &&
    typeof value === "number" &&
    value > (rule.value ?? 0)
  ) {
    return createIssue(field, rule);
  }
  return undefined;
}

function createIssue(
  field: FormFieldDefinition,
  rule: FormValidationRule,
): FormIssue {
  return { code: rule.code, messageKey: rule.messageKey, path: [field.name] };
}

function getLength(value: FormValues[string]): number {
  return typeof value === "string" || Array.isArray(value) ? value.length : 0;
}

function isEmpty(value: FormValues[string] | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isEmail(value: string): boolean {
  if (value.length > 254) {
    return false;
  }
  const separator = value.indexOf("@");
  return (
    separator > 0 &&
    separator < value.length - 1 &&
    value.includes(".", separator)
  );
}
