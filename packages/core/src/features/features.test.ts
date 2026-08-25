import { describe, expect, it } from "vitest";
import {
  compileFeatureCatalog,
  defineFeature,
  defineFeatureCatalog,
  FeatureDefinitionError,
  validateFeatureValue,
} from ".";
import type { FeatureDefinition } from "./feature-definition";
import type { FeatureDefinitionErrorCode } from "./feature-error";

const operation = {
  access: { mode: "public" },
  audit: { event: "contact.submitted", required: true },
  handler: "contact.submit",
  id: "submit",
  idempotency: { required: true },
  input: {
    additionalProperties: false,
    properties: { email: { format: "email", maxLength: 200, type: "string" } },
    required: ["email"],
    type: "object",
  },
  kind: "mutation",
  method: "POST",
  output: {
    additionalProperties: false,
    properties: { id: { format: "uuid", type: "string" } },
    required: ["id"],
    type: "object",
  },
  rateLimit: { cost: 1, limit: 5, windowMs: 60_000 },
} as const;

const feature: FeatureDefinition = {
  blocks: ["contact.form"],
  id: "contact",
  operations: [operation],
  pages: [
    {
      access: { mode: "public" },
      id: "landing",
      root: {
        children: [
          {
            actions: { submit: "submit" },
            block: "contact.form",
            id: "form",
            kind: "block",
          },
        ],
        id: "root",
        kind: "layout",
        layout: "marketing.stack",
      },
      routes: {
        mobile: { path: "/contact" },
        web: {
          path: "/contact",
          seo: {
            canonicalPath: "/contact",
            description: "Contact the team.",
            index: true,
            title: "Contact",
          },
        },
      },
    },
  ],
  schemaVersion: 1,
  version: "1.0.0",
};

describe("feature catalog", () => {
  it("compiles routes, pages and operations from one immutable definition", () => {
    const catalog = defineFeatureCatalog({
      application: {
        defaultLocale: "fr",
        description: "Application",
        name: "Demo",
        shortName: "Demo",
      },
      features: [defineFeature(feature)],
      schemaVersion: 1,
    });

    const compiled = compileFeatureCatalog(catalog);
    expect(compiled.routes).toHaveLength(2);
    expect(compiled.operations["contact.submit"]?.handler).toBe(
      "contact.submit",
    );
    expect(compiled.pages["contact.landing"]?.root.layout).toBe(
      "marketing.stack",
    );
    expect(Object.isFrozen(compiled)).toBe(true);
  });

  it.each<readonly [string, FeatureDefinition, FeatureDefinitionErrorCode]>([
    ["unknown block", { ...feature, blocks: [] }, "UNKNOWN_BLOCK"],
    ["unknown operation", { ...feature, operations: [] }, "UNKNOWN_OPERATION"],
    [
      "mutation without audit",
      {
        ...feature,
        operations: [{ ...operation, audit: undefined }],
      } as unknown as FeatureDefinition,
      "INVALID_DEFINITION",
    ],
  ])("rejects %s", (_label, invalid, code) => {
    expect(() => defineFeature(invalid as FeatureDefinition)).toThrowError(
      expect.objectContaining<Partial<FeatureDefinitionError>>({ code }),
    );
  });

  it("rejects duplicate routes across features", () => {
    expect(() =>
      defineFeatureCatalog({
        application: {
          defaultLocale: "fr",
          description: "Application",
          name: "Demo",
          shortName: "Demo",
        },
        features: [feature, { ...feature, id: "support" }],
        schemaVersion: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_ROUTE" }));
  });

  it.each([
    ["invalid catalog version", { schemaVersion: 0 }],
    ["invalid locale", { application: { defaultLocale: "FR_fr" } }],
    [
      "duplicate block",
      { features: [{ ...feature, blocks: ["contact.form", "contact.form"] }] },
    ],
    [
      "missing page routes",
      {
        features: [
          { ...feature, pages: [{ ...feature.pages[0], routes: {} }] },
        ],
      },
    ],
    [
      "mismatched canonical",
      {
        features: [
          {
            ...feature,
            pages: [
              {
                ...feature.pages[0],
                routes: {
                  web: {
                    ...feature.pages[0]?.routes.web,
                    path: "/contact",
                    seo: {
                      ...feature.pages[0]?.routes.web?.seo,
                      canonicalPath: "/other",
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  ])("rejects %s", (_label, override) => {
    const base = {
      application: {
        defaultLocale: "fr",
        description: "Application",
        name: "Demo",
        shortName: "Demo",
      },
      features: [feature],
      schemaVersion: 1,
    };
    expect(() =>
      defineFeatureCatalog(merge(base, override) as never),
    ).toThrowError(FeatureDefinitionError);
  });
});

describe("feature value schema", () => {
  it("accepts strict bounded values", () => {
    expect(
      validateFeatureValue(operation.input, { email: "hello@example.com" }),
    ).toEqual({
      issues: [],
      success: true,
      value: { email: "hello@example.com" },
    });
  });

  it("rejects unknown, malformed and missing values", () => {
    const result = validateFeatureValue(operation.input, { extra: true });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.issues.map((issue) => issue.code)).toEqual([
        "REQUIRED",
        "UNKNOWN_FIELD",
      ]);
  });

  it.each([
    [{ type: "boolean" }, true, true],
    [{ type: "boolean" }, "true", false],
    [{ type: "null" }, null, true],
    [{ type: "null" }, 0, false],
    [{ minimum: 1, maximum: 3, type: "number" }, 2, true],
    [{ minimum: 1, maximum: 3, type: "number" }, 0, false],
    [{ minimum: 1, maximum: 3, type: "number" }, 4, false],
    [{ type: "number" }, Number.NaN, false],
    [{ enum: ["a"], minLength: 1, maxLength: 2, type: "string" }, "a", true],
    [{ enum: ["a"], type: "string" }, "b", false],
    [{ minLength: 2, type: "string" }, "a", false],
    [{ maxLength: 2, type: "string" }, "abc", false],
    [{ format: "date", type: "string" }, "2026-08-25", true],
    [{ format: "date", type: "string" }, "25/08/2026", false],
    [
      { format: "uuid", type: "string" },
      "018f6b7c-2e12-7d8a-9b00-123456789abc",
      true,
    ],
    [
      { items: { type: "boolean" }, minItems: 1, maxItems: 2, type: "array" },
      [true],
      true,
    ],
    [{ items: { type: "boolean" }, minItems: 1, type: "array" }, [], false],
    [
      { items: { type: "boolean" }, maxItems: 1, type: "array" },
      [true, false],
      false,
    ],
    [{ items: { type: "boolean" }, type: "array" }, ["bad"], false],
    [{ items: { type: "boolean" }, type: "array" }, {}, false],
    [{ properties: {}, type: "object" }, null, false],
  ] as const)("validates schema %#", (schema, value, success) => {
    expect(validateFeatureValue(schema, value).success).toBe(success);
  });
});

function merge(base: unknown, override: unknown): unknown {
  if (!isRecord(base) || !isRecord(override)) return override;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? merge(result[key], value) : value;
  }
  return result;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}
