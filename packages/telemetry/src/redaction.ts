import type { Attributes, AttributeValue } from "@opentelemetry/api";

const SAFE_KEY = /^[a-z][a-z0-9_.-]{0,63}$/;

export function selectSafeAttributes(
  input: Readonly<Record<string, unknown>>,
  allowlist: readonly string[],
): Attributes {
  const allowed = new Set(allowlist);
  const attributes: Attributes = {};

  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key) || !SAFE_KEY.test(key) || !isAttributeValue(value)) {
      continue;
    }
    attributes[key] = value;
  }

  return attributes;
}

function isAttributeValue(value: unknown): value is AttributeValue {
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  return Array.isArray(value) && value.every(isScalarAttribute);
}

function isScalarAttribute(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
