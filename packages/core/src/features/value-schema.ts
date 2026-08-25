import type { JsonValue } from "../contracts";
import type { FeatureValueSchema } from "./feature-definition";

export interface FeatureValueIssue {
  readonly code:
    | "FORMAT"
    | "MAX"
    | "MIN"
    | "REQUIRED"
    | "TYPE"
    | "UNKNOWN_FIELD";
  readonly path: readonly string[];
}

export type FeatureValueResult =
  | {
      readonly issues: readonly [];
      readonly success: true;
      readonly value: JsonValue;
    }
  | { readonly issues: readonly FeatureValueIssue[]; readonly success: false };

const FORMATS: Readonly<
  Record<
    NonNullable<Extract<FeatureValueSchema, { type: "string" }>["format"]>,
    RegExp
  >
> = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
};

export function validateFeatureValue(
  schema: FeatureValueSchema,
  value: unknown,
): FeatureValueResult {
  const issues: FeatureValueIssue[] = [];
  validateNode(schema, value, [], issues);
  return issues.length === 0
    ? { issues: [], success: true, value: value as JsonValue }
    : { issues, success: false };
}

function validateNode(
  schema: FeatureValueSchema,
  value: unknown,
  path: readonly string[],
  issues: FeatureValueIssue[],
): void {
  if (schema.type === "string") {
    validateString(schema, value, path, issues);
    return;
  }
  if (schema.type === "number") {
    validateNumber(schema, value, path, issues);
    return;
  }
  if (schema.type === "boolean" || schema.type === "null") {
    const matches =
      schema.type === "null" ? value === null : typeof value === "boolean";
    if (!matches) issues.push({ code: "TYPE", path });
    return;
  }
  if (schema.type === "array") {
    validateArray(schema, value, path, issues);
    return;
  }
  validateObject(schema, value, path, issues);
}

function validateString(
  schema: Extract<FeatureValueSchema, { type: "string" }>,
  value: unknown,
  path: readonly string[],
  issues: FeatureValueIssue[],
): void {
  if (typeof value !== "string") {
    issues.push({ code: "TYPE", path });
    return;
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    issues.push({ code: "MIN", path });
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    issues.push({ code: "MAX", path });
  }
  if (schema.enum && !schema.enum.includes(value))
    issues.push({ code: "FORMAT", path });
  if (schema.format && !FORMATS[schema.format].test(value)) {
    issues.push({ code: "FORMAT", path });
  }
}

function validateNumber(
  schema: Extract<FeatureValueSchema, { type: "number" }>,
  value: unknown,
  path: readonly string[],
  issues: FeatureValueIssue[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ code: "TYPE", path });
    return;
  }
  if (schema.minimum !== undefined && value < schema.minimum)
    issues.push({ code: "MIN", path });
  if (schema.maximum !== undefined && value > schema.maximum)
    issues.push({ code: "MAX", path });
}

function validateArray(
  schema: Extract<FeatureValueSchema, { type: "array" }>,
  value: unknown,
  path: readonly string[],
  issues: FeatureValueIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ code: "TYPE", path });
    return;
  }
  if (schema.minItems !== undefined && value.length < schema.minItems)
    issues.push({ code: "MIN", path });
  if (schema.maxItems !== undefined && value.length > schema.maxItems)
    issues.push({ code: "MAX", path });
  for (const [index, item] of value.entries()) {
    validateNode(schema.items, item, [...path, String(index)], issues);
  }
}

function validateObject(
  schema: Extract<FeatureValueSchema, { type: "object" }>,
  value: unknown,
  path: readonly string[],
  issues: FeatureValueIssue[],
): void {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    issues.push({ code: "TYPE", path });
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  for (const required of schema.required ?? []) {
    if (!(required in record))
      issues.push({ code: "REQUIRED", path: [...path, required] });
  }
  for (const [name, fieldValue] of Object.entries(record)) {
    const property = schema.properties[name];
    if (!property) {
      issues.push({ code: "UNKNOWN_FIELD", path: [...path, name] });
      continue;
    }
    validateNode(property, fieldValue, [...path, name], issues);
  }
}
