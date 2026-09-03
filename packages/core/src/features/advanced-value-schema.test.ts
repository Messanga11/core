import { describe, expect, it } from "vitest";
import type { FeatureValueSchema } from "./feature-definition";
import { validateFeatureValue } from "./value-schema";

describe("advanced feature value schemas", () => {
  it("validates nullable values without weakening the wrapped schema", () => {
    const schema = {
      type: "nullable",
      value: { maxLength: 20, type: "string" },
    } as const satisfies FeatureValueSchema;

    expect(validateFeatureValue(schema, null).success).toBe(true);
    expect(validateFeatureValue(schema, "available").success).toBe(true);
    expect(validateFeatureValue(schema, 42).success).toBe(false);
  });

  it("accepts exactly one union variant", () => {
    const schema = {
      oneOf: [
        { enum: ["draft", "published"], type: "string" },
        { minimum: 1, type: "integer" },
      ],
      type: "union",
    } as const satisfies FeatureValueSchema;

    expect(validateFeatureValue(schema, "draft").success).toBe(true);
    expect(validateFeatureValue(schema, 2).success).toBe(true);
    expect(validateFeatureValue(schema, 1.5).success).toBe(false);
    expect(validateFeatureValue(schema, false).success).toBe(false);
  });

  it("validates integers and finite decimal strings", () => {
    const integer = {
      maximum: 10,
      minimum: 1,
      type: "integer",
    } as const satisfies FeatureValueSchema;
    const decimal = {
      precision: 8,
      scale: 2,
      type: "decimal",
    } as const satisfies FeatureValueSchema;

    expect(validateFeatureValue(integer, 4).success).toBe(true);
    expect(validateFeatureValue(integer, 4.1).success).toBe(false);
    expect(validateFeatureValue(decimal, "123456.78").success).toBe(true);
    expect(validateFeatureValue(decimal, "1234567.89").success).toBe(false);
    expect(validateFeatureValue(decimal, "12.345").success).toBe(false);
  });

  it("keeps references opaque and bounded", () => {
    const reference = {
      resource: "customers",
      type: "reference",
    } as const satisfies FeatureValueSchema;

    expect(validateFeatureValue(reference, "customer-1").success).toBe(true);
    expect(validateFeatureValue(reference, "").success).toBe(false);
    expect(validateFeatureValue(reference, 1).success).toBe(false);
  });
});
