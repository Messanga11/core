import { describe, expect, it } from "vitest";
import type {
  CapabilityPackErrorCode,
  FeatureCapabilityPack,
} from "./capability-pack";
import {
  type CapabilityPackError,
  compileCapabilityPacks,
  defineCapabilityPack,
  generateCapabilityArtifacts,
} from "./capability-pack";
import type { FeatureDefinition } from "./feature-definition";

const feature: FeatureDefinition = {
  blocks: ["profile.screen"],
  id: "profile",
  operations: [],
  pages: [
    {
      access: { mode: "public" },
      id: "index",
      root: {
        children: [{ block: "profile.screen", id: "content", kind: "block" }],
        id: "root",
        kind: "layout",
        layout: "application.shell",
      },
      routes: {
        web: {
          path: "/profile",
          seo: {
            canonicalPath: "/profile",
            description: "Profile page.",
            index: false,
            title: "Profile",
          },
        },
      },
    },
  ],
  schemaVersion: 1,
  version: "1.0.0",
};

const essentials = defineCapabilityPack({
  features: [feature],
  generators: [
    {
      generate: () => [
        { contents: "generated", path: "contracts/profile.json" },
      ],
      id: "contracts",
      schemaVersion: 1,
      target: "contract",
    },
  ],
  hooks: [
    {
      config: { delivery: "inbox" },
      id: "notifications.dispatch",
      kind: "job",
      schemaVersion: 1,
    },
    {
      id: "profile.screen",
      kind: "component",
      schemaVersion: 1,
    },
  ],
  manifest: {
    catalogSchemaVersion: 1,
    id: "essentials",
    version: "1.0.0",
  },
  migrations: [
    {
      engine: "postgresql",
      id: "profile-storage",
      payload: { resource: "profile" },
      version: 1,
    },
  ],
});

describe("capability pack compiler", () => {
  it("compiles allowlisted packs into one immutable catalog", () => {
    const compiled = compileCapabilityPacks({
      allowlist: ["essentials"],
      application: application(),
      packs: [essentials],
      schemaVersion: 1,
    });

    expect(compiled.catalog.pages["profile.index"]).toBeDefined();
    expect(
      compiled.hooks.job["essentials.notifications.dispatch"]?.config,
    ).toEqual({
      delivery: "inbox",
    });
    expect(compiled.manifests.essentials?.version).toBe("1.0.0");
    expect(compiled.migrations[0]?.id).toBe("profile-storage");
    expect(Object.isFrozen(compiled)).toBe(true);
  });

  it("generates confined deterministic artifacts", () => {
    const compiled = compileCapabilityPacks({
      allowlist: ["essentials"],
      application: application(),
      packs: [essentials],
      schemaVersion: 1,
    });

    expect(generateCapabilityArtifacts(compiled)).toEqual([
      {
        contents: "generated",
        path: "contracts/profile.json",
        source: "essentials.contracts",
      },
    ]);
  });

  it("rejects a generator that attempts to escape the output root", () => {
    const unsafe = defineCapabilityPack({
      features: [],
      generators: [
        {
          generate: () => [{ contents: "unsafe", path: "../outside" }],
          id: "unsafe",
          schemaVersion: 1,
          target: "server",
        },
      ],
      manifest: {
        catalogSchemaVersion: 1,
        id: "unsafe",
        version: "1.0.0",
      },
    });
    const compiled = compileCapabilityPacks({
      allowlist: ["unsafe"],
      application: application(),
      packs: [unsafe],
      schemaVersion: 1,
    });

    expect(() => generateCapabilityArtifacts(compiled)).toThrowError(
      expect.objectContaining({ code: "INVALID_ARTIFACT" }),
    );
  });

  it.each<
    readonly [
      string,
      {
        readonly allowlist: readonly string[];
        readonly packs: readonly FeatureCapabilityPack[];
      },
      CapabilityPackErrorCode,
    ]
  >([
    [
      "a pack outside the allowlist",
      { allowlist: [], packs: [essentials] },
      "PACK_NOT_ALLOWED",
    ],
    [
      "an incompatible catalog schema",
      {
        allowlist: ["essentials"],
        packs: [
          {
            ...essentials,
            manifest: { ...essentials.manifest, catalogSchemaVersion: 2 },
          },
        ],
      },
      "INCOMPATIBLE_VERSION",
    ],
    [
      "a missing dependency",
      {
        allowlist: ["essentials"],
        packs: [
          {
            ...essentials,
            manifest: { ...essentials.manifest, requires: ["identity"] },
          },
        ],
      },
      "MISSING_DEPENDENCY",
    ],
  ])("rejects %s", (_label, override, code) => {
    expect(() =>
      compileCapabilityPacks({
        application: application(),
        schemaVersion: 1,
        ...override,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CapabilityPackError>>({ code }),
    );
  });

  it("rejects duplicate pack and hook identifiers", () => {
    expect(() =>
      compileCapabilityPacks({
        allowlist: ["essentials"],
        application: application(),
        packs: [essentials, essentials],
        schemaVersion: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_PACK" }));

    const duplicateHook = defineCapabilityPack({
      features: [],
      hooks: [
        { id: "shared", kind: "event", schemaVersion: 1 },
        { id: "shared", kind: "event", schemaVersion: 1 },
      ],
      manifest: {
        catalogSchemaVersion: 1,
        id: "events",
        version: "1.0.0",
      },
    });
    expect(() =>
      compileCapabilityPacks({
        allowlist: ["events"],
        application: application(),
        packs: [duplicateHook],
        schemaVersion: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_HOOK" }));
  });

  it("runs pack validation and reports stable diagnostics", () => {
    const invalid = defineCapabilityPack({
      features: [],
      manifest: {
        catalogSchemaVersion: 1,
        id: "invalid",
        version: "1.0.0",
      },
      validate: () => [
        { code: "MISSING_CONFIGURATION", path: "payments.currency" },
      ],
    });

    expect(() =>
      compileCapabilityPacks({
        allowlist: ["invalid"],
        application: application(),
        packs: [invalid],
        schemaVersion: 1,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "PACK_VALIDATION_FAILED",
        path: "packs.invalid.payments.currency",
      }),
    );
  });
});

function application() {
  return {
    defaultLocale: "en",
    description: "Capability pack test.",
    name: "Test",
    shortName: "Test",
  };
}
