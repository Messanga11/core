import { describe, expect, it } from "vitest";
import {
  createDesignSystem,
  DEFAULT_DESIGN_TOKENS,
  DesignTokenOverridesSchema,
} from "./design-system";

describe("createDesignSystem", () => {
  it("returns immutable renderer-neutral defaults", () => {
    const tokens = createDesignSystem();

    expect(tokens).toEqual(DEFAULT_DESIGN_TOKENS);
    expect(Object.isFrozen(tokens)).toBe(true);
    expect(Object.isFrozen(tokens.color)).toBe(true);
    expect(Object.isFrozen(tokens.type.body)).toBe(true);
  });

  it("merges validated semantic overrides without dropping defaults", () => {
    const tokens = createDesignSystem({
      color: { accent: "#315d55" },
      spacing: { md: 28 },
    });

    expect(tokens.color.accent).toBe("#315d55");
    expect(tokens.color.canvas).toBe(DEFAULT_DESIGN_TOKENS.color.canvas);
    expect(tokens.spacing.md).toBe(28);
    expect(tokens.spacing.xl).toBe(DEFAULT_DESIGN_TOKENS.spacing.xl);
  });

  it("rejects invalid and unknown configuration", () => {
    expect(() => createDesignSystem({ color: { accent: "purple" } })).toThrow();
    expect(() =>
      DesignTokenOverridesSchema.parse({ shadow: { card: 2 } }),
    ).toThrow();
  });
});
