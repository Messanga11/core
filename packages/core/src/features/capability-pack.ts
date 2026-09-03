import type { JsonValue } from "../contracts";
import type { FeatureOperationHandler } from "../feature-server/feature-runtime";
import { compileFeatureCatalog } from "./compile-feature-catalog";
import type {
  CompiledFeatureCatalog,
  FeatureCatalogDefinition,
  FeatureDefinition,
} from "./feature-definition";

export const CAPABILITY_HOOK_KINDS = [
  "component",
  "deployment",
  "event",
  "integration",
  "job",
  "layout",
  "operation",
  "page",
  "resource",
] as const;

export type CapabilityHookKind = (typeof CAPABILITY_HOOK_KINDS)[number];

export interface CapabilityPackDiagnostic {
  readonly code: string;
  readonly path: string;
}

export interface FeatureCapabilityHook {
  readonly config?: JsonValue;
  readonly id: string;
  readonly kind: CapabilityHookKind;
  readonly schemaVersion: number;
}

export interface FeatureCapabilityManifest {
  readonly catalogSchemaVersion: number;
  readonly id: string;
  readonly requires?: readonly string[];
  readonly version: string;
}

export interface FeatureCapabilityPack {
  readonly features: readonly FeatureDefinition[];
  readonly generators?: readonly FeatureCapabilityGenerator[];
  readonly handlers?: Readonly<Record<string, FeatureOperationHandler>>;
  readonly hooks?: readonly FeatureCapabilityHook[];
  readonly manifest: FeatureCapabilityManifest;
  readonly migrations?: readonly FeatureCapabilityMigration[];
  readonly validate?: (
    context: CapabilityPackValidationContext,
  ) => readonly CapabilityPackDiagnostic[];
}

export type CapabilityGeneratorTarget =
  | "client-mobile"
  | "client-web"
  | "contract"
  | "deployment"
  | "server"
  | "test";

export interface CapabilityGeneratedArtifact {
  readonly contents: string;
  readonly path: string;
}

export interface FeatureCapabilityGenerator {
  readonly generate: (
    context: CapabilityGeneratorContext,
  ) => readonly CapabilityGeneratedArtifact[];
  readonly id: string;
  readonly schemaVersion: number;
  readonly target: CapabilityGeneratorTarget;
}

export interface CapabilityGeneratorContext {
  readonly catalog: CompiledFeatureCatalog;
  readonly manifests: Readonly<Record<string, FeatureCapabilityManifest>>;
}

export interface FeatureCapabilityMigration {
  readonly engine: string;
  readonly id: string;
  readonly payload: JsonValue;
  readonly version: number;
}

export interface CompiledCapabilityArtifact
  extends CapabilityGeneratedArtifact {
  readonly source: string;
}

export interface CapabilityPackValidationContext {
  readonly application: FeatureCatalogDefinition["application"];
  readonly enabledPacks: ReadonlySet<string>;
  readonly schemaVersion: number;
}

export interface CompiledCapabilityPacks {
  readonly catalog: CompiledFeatureCatalog;
  readonly generators: Readonly<Record<string, FeatureCapabilityGenerator>>;
  readonly handlers: Readonly<Record<string, FeatureOperationHandler>>;
  readonly hooks: Readonly<
    Record<CapabilityHookKind, Readonly<Record<string, FeatureCapabilityHook>>>
  >;
  readonly manifests: Readonly<Record<string, FeatureCapabilityManifest>>;
  readonly migrations: readonly FeatureCapabilityMigration[];
}

export type CapabilityPackErrorCode =
  | "DUPLICATE_HOOK"
  | "DUPLICATE_PACK"
  | "DUPLICATE_GENERATOR"
  | "DUPLICATE_HANDLER"
  | "DUPLICATE_MIGRATION"
  | "INCOMPATIBLE_VERSION"
  | "INVALID_PACK"
  | "INVALID_ARTIFACT"
  | "MISSING_DEPENDENCY"
  | "PACK_NOT_ALLOWED"
  | "PACK_VALIDATION_FAILED";

export class CapabilityPackError extends Error {
  public readonly code: CapabilityPackErrorCode;
  public readonly path: string;

  public constructor(code: CapabilityPackErrorCode, path: string) {
    super(`${code} at ${path}`);
    this.name = "CapabilityPackError";
    this.code = code;
    this.path = path;
  }
}

interface CompileCapabilityPacksOptions {
  readonly allowlist: readonly string[];
  readonly application: FeatureCatalogDefinition["application"];
  readonly packs: readonly FeatureCapabilityPack[];
  readonly schemaVersion: number;
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;

export function defineCapabilityPack<const Pack extends FeatureCapabilityPack>(
  pack: Pack,
): Pack {
  validateManifest(pack.manifest);
  return deepFreeze(pack);
}

export function compileCapabilityPacks(
  options: CompileCapabilityPacksOptions,
): CompiledCapabilityPacks {
  const allowlist = new Set(options.allowlist);
  const manifests = indexManifests(options.packs, allowlist);
  validateDependencies(options.packs, manifests);
  validatePacks(options, manifests);
  const hooks = indexHooks(options.packs);
  const generators = indexGenerators(options.packs);
  const handlers = indexHandlers(options.packs);
  const migrations = indexMigrations(options.packs);
  const catalog = compileFeatureCatalog({
    application: options.application,
    features: options.packs.flatMap((pack) => pack.features),
    schemaVersion: options.schemaVersion,
  });
  return deepFreeze({
    catalog,
    generators,
    handlers,
    hooks,
    manifests,
    migrations,
  });
}

export function generateCapabilityArtifacts(
  compiled: CompiledCapabilityPacks,
): readonly CompiledCapabilityArtifact[] {
  const artifacts: CompiledCapabilityArtifact[] = [];
  const paths = new Set<string>();
  for (const [source, generator] of Object.entries(compiled.generators)) {
    const generated = generator.generate({
      catalog: compiled.catalog,
      manifests: compiled.manifests,
    });
    for (const artifact of generated) {
      validateArtifact(artifact, source);
      if (paths.has(artifact.path)) fail("INVALID_ARTIFACT", artifact.path);
      paths.add(artifact.path);
      artifacts.push({ ...artifact, source });
    }
  }
  return deepFreeze(
    artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  );
}

function indexManifests(
  packs: readonly FeatureCapabilityPack[],
  allowlist: ReadonlySet<string>,
): Record<string, FeatureCapabilityManifest> {
  const manifests: Record<string, FeatureCapabilityManifest> = {};
  for (const pack of packs) {
    validateManifest(pack.manifest);
    const id = pack.manifest.id;
    if (!allowlist.has(id)) fail("PACK_NOT_ALLOWED", `packs.${id}`);
    if (manifests[id]) fail("DUPLICATE_PACK", `packs.${id}`);
    manifests[id] = pack.manifest;
  }
  return manifests;
}

function validateDependencies(
  packs: readonly FeatureCapabilityPack[],
  manifests: Readonly<Record<string, FeatureCapabilityManifest>>,
): void {
  for (const pack of packs) {
    for (const dependency of pack.manifest.requires ?? []) {
      if (!IDENTIFIER.test(dependency)) {
        fail("INVALID_PACK", `packs.${pack.manifest.id}.requires`);
      }
      if (!manifests[dependency]) {
        fail(
          "MISSING_DEPENDENCY",
          `packs.${pack.manifest.id}.requires.${dependency}`,
        );
      }
    }
  }
}

function validatePacks(
  options: CompileCapabilityPacksOptions,
  manifests: Readonly<Record<string, FeatureCapabilityManifest>>,
): void {
  const enabledPacks = new Set(Object.keys(manifests));
  for (const pack of options.packs) {
    if (pack.manifest.catalogSchemaVersion !== options.schemaVersion) {
      fail("INCOMPATIBLE_VERSION", `packs.${pack.manifest.id}`);
    }
    const diagnostics = pack.validate?.({
      application: options.application,
      enabledPacks,
      schemaVersion: options.schemaVersion,
    });
    const first = diagnostics?.[0];
    if (first) {
      fail("PACK_VALIDATION_FAILED", `packs.${pack.manifest.id}.${first.path}`);
    }
  }
}

function indexHooks(
  packs: readonly FeatureCapabilityPack[],
): Record<CapabilityHookKind, Record<string, FeatureCapabilityHook>> {
  const hooks = Object.fromEntries(
    CAPABILITY_HOOK_KINDS.map((kind) => [kind, {}]),
  ) as Record<CapabilityHookKind, Record<string, FeatureCapabilityHook>>;
  const globalIds = new Set<string>();
  for (const pack of packs) {
    for (const hook of pack.hooks ?? []) {
      validateHook(hook, pack.manifest.id);
      const collisionKey = `${hook.kind}:${hook.id}`;
      if (globalIds.has(collisionKey)) {
        fail("DUPLICATE_HOOK", `packs.${pack.manifest.id}.hooks.${hook.id}`);
      }
      globalIds.add(collisionKey);
      hooks[hook.kind][`${pack.manifest.id}.${hook.id}`] = hook;
    }
  }
  return hooks;
}

function indexGenerators(
  packs: readonly FeatureCapabilityPack[],
): Record<string, FeatureCapabilityGenerator> {
  const generators: Record<string, FeatureCapabilityGenerator> = {};
  for (const pack of packs) {
    for (const generator of pack.generators ?? []) {
      if (!IDENTIFIER.test(generator.id) || generator.schemaVersion < 1) {
        fail("INVALID_PACK", `packs.${pack.manifest.id}.generators`);
      }
      const id = `${pack.manifest.id}.${generator.id}`;
      if (generators[id]) fail("DUPLICATE_GENERATOR", id);
      generators[id] = generator;
    }
  }
  return generators;
}

function indexMigrations(
  packs: readonly FeatureCapabilityPack[],
): readonly FeatureCapabilityMigration[] {
  const migrations: FeatureCapabilityMigration[] = [];
  const ids = new Set<string>();
  for (const pack of packs) {
    for (const migration of pack.migrations ?? []) {
      const id = `${pack.manifest.id}.${migration.id}`;
      if (
        !IDENTIFIER.test(migration.id) ||
        !IDENTIFIER.test(migration.engine) ||
        !Number.isSafeInteger(migration.version) ||
        migration.version < 1
      )
        fail("INVALID_PACK", `packs.${pack.manifest.id}.migrations`);
      if (ids.has(id)) fail("DUPLICATE_MIGRATION", id);
      ids.add(id);
      migrations.push(migration);
    }
  }
  return migrations;
}

function indexHandlers(
  packs: readonly FeatureCapabilityPack[],
): Record<string, FeatureOperationHandler> {
  const handlers: Record<string, FeatureOperationHandler> = {};
  for (const pack of packs) {
    for (const [id, handler] of Object.entries(pack.handlers ?? {})) {
      if (!IDENTIFIER.test(id)) {
        fail("INVALID_PACK", `packs.${pack.manifest.id}.handlers`);
      }
      if (handlers[id]) fail("DUPLICATE_HANDLER", id);
      handlers[id] = handler;
    }
  }
  return handlers;
}

function validateArtifact(
  artifact: CapabilityGeneratedArtifact,
  source: string,
): void {
  if (
    artifact.path.length < 1 ||
    artifact.path.length > 240 ||
    artifact.path.startsWith("/") ||
    artifact.path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..") ||
    artifact.contents.length > 5_000_000
  )
    fail("INVALID_ARTIFACT", source);
}

function validateManifest(manifest: FeatureCapabilityManifest): void {
  if (!IDENTIFIER.test(manifest.id)) fail("INVALID_PACK", "manifest.id");
  if (!VERSION.test(manifest.version)) fail("INVALID_PACK", "manifest.version");
  if (!Number.isSafeInteger(manifest.catalogSchemaVersion)) {
    fail("INVALID_PACK", "manifest.catalogSchemaVersion");
  }
}

function validateHook(hook: FeatureCapabilityHook, packId: string): void {
  if (!IDENTIFIER.test(hook.id)) {
    fail("INVALID_PACK", `packs.${packId}.hooks.id`);
  }
  if (!CAPABILITY_HOOK_KINDS.includes(hook.kind)) {
    fail("INVALID_PACK", `packs.${packId}.hooks.${hook.id}.kind`);
  }
  if (!Number.isSafeInteger(hook.schemaVersion) || hook.schemaVersion < 1) {
    fail("INVALID_PACK", `packs.${packId}.hooks.${hook.id}.schemaVersion`);
  }
}

function fail(code: CapabilityPackErrorCode, path: string): never {
  throw new CapabilityPackError(code, path);
}

function deepFreeze<Value>(value: Value): Value {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
