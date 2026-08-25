import { z } from "zod";

const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const PositiveNumberSchema = z.number().finite().nonnegative();

const ColorTokensSchema = z
  .object({
    accent: HexColorSchema,
    accentContrast: HexColorSchema,
    body: HexColorSchema,
    border: HexColorSchema,
    canvas: HexColorSchema,
    danger: HexColorSchema,
    ink: HexColorSchema,
    muted: HexColorSchema,
    surface: HexColorSchema,
  })
  .strict();

const ScaleTokensSchema = z
  .object({
    lg: PositiveNumberSchema,
    md: PositiveNumberSchema,
    sm: PositiveNumberSchema,
    xl: PositiveNumberSchema,
    xs: PositiveNumberSchema,
  })
  .strict();

const RadiusTokensSchema = z
  .object({
    card: PositiveNumberSchema,
    control: PositiveNumberSchema,
    pill: PositiveNumberSchema,
  })
  .strict();

const TypographyTokensSchema = z
  .object({
    body: z.array(z.string().trim().min(1)).min(1),
    mono: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const MotionTokensSchema = z
  .object({
    fast: PositiveNumberSchema,
    standard: PositiveNumberSchema,
  })
  .strict();

export const DesignTokensSchema = z
  .object({
    color: ColorTokensSchema,
    motion: MotionTokensSchema,
    radius: RadiusTokensSchema,
    spacing: ScaleTokensSchema,
    type: TypographyTokensSchema,
  })
  .strict();

export const DesignTokenOverridesSchema = z
  .object({
    color: ColorTokensSchema.partial().optional(),
    motion: MotionTokensSchema.partial().optional(),
    radius: RadiusTokensSchema.partial().optional(),
    spacing: ScaleTokensSchema.partial().optional(),
    type: TypographyTokensSchema.partial().optional(),
  })
  .strict();

export interface DesignTokens {
  readonly color: Readonly<z.infer<typeof ColorTokensSchema>>;
  readonly motion: Readonly<z.infer<typeof MotionTokensSchema>>;
  readonly radius: Readonly<z.infer<typeof RadiusTokensSchema>>;
  readonly spacing: Readonly<z.infer<typeof ScaleTokensSchema>>;
  readonly type: {
    readonly body: readonly string[];
    readonly mono: readonly string[];
  };
}
export type DesignTokenOverrides = Readonly<
  z.infer<typeof DesignTokenOverridesSchema>
>;

export const DEFAULT_DESIGN_TOKENS: DesignTokens = freezeTokens({
  color: {
    accent: "#2d6a4f",
    accentContrast: "#ffffff",
    body: "#57534b",
    border: "#d8d4ca",
    canvas: "#f4f2ed",
    danger: "#a33a32",
    ink: "#171714",
    muted: "#68645c",
    surface: "#fffef9",
  },
  motion: { fast: 120, standard: 220 },
  radius: { card: 18, control: 12, pill: 999 },
  spacing: { lg: 40, md: 24, sm: 12, xl: 64, xs: 8 },
  type: {
    body: ["Geist", "Avenir Next", "ui-sans-serif", "system-ui", "sans-serif"],
    mono: ["Geist Mono", "ui-monospace", "monospace"],
  },
});

export function createDesignSystem(
  overrides: DesignTokenOverrides = {},
): DesignTokens {
  const parsed = DesignTokenOverridesSchema.parse(overrides);
  return freezeTokens({
    color: mergeDefined(DEFAULT_DESIGN_TOKENS.color, parsed.color),
    motion: mergeDefined(DEFAULT_DESIGN_TOKENS.motion, parsed.motion),
    radius: mergeDefined(DEFAULT_DESIGN_TOKENS.radius, parsed.radius),
    spacing: mergeDefined(DEFAULT_DESIGN_TOKENS.spacing, parsed.spacing),
    type: mergeDefined(DEFAULT_DESIGN_TOKENS.type, parsed.type),
  });
}

type UndefinedPartial<T> = { [Key in keyof T]?: T[Key] | undefined };

function mergeDefined<T extends object>(
  defaults: T,
  overrides: UndefinedPartial<T> = {},
): T {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as UndefinedPartial<T>;
  return { ...defaults, ...definedOverrides };
}

function freezeTokens(tokens: unknown): DesignTokens {
  const parsed = DesignTokensSchema.parse(tokens);
  return Object.freeze({
    color: Object.freeze(parsed.color),
    motion: Object.freeze(parsed.motion),
    radius: Object.freeze(parsed.radius),
    spacing: Object.freeze(parsed.spacing),
    type: Object.freeze({
      body: Object.freeze(parsed.type.body),
      mono: Object.freeze(parsed.type.mono),
    }),
  });
}
