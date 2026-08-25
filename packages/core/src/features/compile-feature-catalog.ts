import type {
  CompiledFeatureCatalog,
  CompiledFeatureRoute,
  FeatureCatalogDefinition,
  FeatureDefinition,
  FeatureNode,
  FeatureOperationDefinition,
  FeaturePageDefinition,
} from "./feature-definition";
import { FeatureDefinitionError } from "./feature-error";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const ROUTE = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;
const PERMISSION = /^[a-z][a-z0-9]*(?:[.:][a-z0-9-]+)+$/;

export function defineFeature<const Definition extends FeatureDefinition>(
  definition: Definition,
): Definition {
  validateFeature(definition, `features.${definition.id || "unknown"}`);
  return deepFreeze(definition);
}

export function defineFeatureCatalog<
  const Definition extends FeatureCatalogDefinition,
>(definition: Definition): Definition {
  compileFeatureCatalog(definition);
  return deepFreeze(definition);
}

export function compileFeatureCatalog(
  definition: FeatureCatalogDefinition,
): CompiledFeatureCatalog {
  assertPositiveInteger(definition.schemaVersion, "schemaVersion");
  assertNonEmpty(definition.application.name, "application.name");
  assertNonEmpty(definition.application.shortName, "application.shortName");
  assertNonEmpty(definition.application.description, "application.description");
  assertIdentifier(
    definition.application.defaultLocale,
    "application.defaultLocale",
  );

  const featureIds = new Set<string>();
  const pageIndex: Record<string, FeaturePageDefinition> = {};
  const operationIndex: Record<string, FeatureOperationDefinition> = {};
  const routes: CompiledFeatureRoute[] = [];
  const routeKeys = new Set<string>();

  for (const feature of definition.features) {
    validateFeature(feature, `features.${feature.id || "unknown"}`);
    assertUnique(featureIds, feature.id, `features.${feature.id}`);
    indexFeature(feature, pageIndex, operationIndex, routes, routeKeys);
  }

  return deepFreeze({
    definition,
    operations: operationIndex,
    pages: pageIndex,
    routes,
  });
}

function validateFeature(feature: FeatureDefinition, path: string): void {
  assertIdentifier(feature.id, `${path}.id`);
  assertPositiveInteger(feature.schemaVersion, `${path}.schemaVersion`);
  if (!VERSION.test(feature.version))
    fail("INVALID_DEFINITION", `${path}.version`);
  const blockNames = new Set<string>();
  const operationIds = new Set<string>();
  const pageIds = new Set<string>();
  for (const block of feature.blocks) {
    assertIdentifier(block, `${path}.blocks`);
    assertUnique(blockNames, block, `${path}.blocks.${block}`);
  }
  for (const operation of feature.operations) {
    validateOperation(
      operation,
      `${path}.operations.${operation.id || "unknown"}`,
    );
    assertUnique(
      operationIds,
      operation.id,
      `${path}.operations.${operation.id}`,
    );
  }
  for (const page of feature.pages) {
    validatePage(page, `${path}.pages.${page.id || "unknown"}`);
    assertUnique(pageIds, page.id, `${path}.pages.${page.id}`);
    validateNodeReferences(
      page.root,
      blockNames,
      operationIds,
      `${path}.pages.${page.id}.root`,
    );
  }
}

function validateOperation(
  operation: FeatureOperationDefinition,
  path: string,
): void {
  assertIdentifier(operation.id, `${path}.id`);
  assertIdentifier(operation.handler, `${path}.handler`);
  if (
    operation.kind === "query" &&
    operation.method !== "GET" &&
    operation.method !== "POST"
  ) {
    fail("INVALID_DEFINITION", `${path}.method`);
  }
  if (operation.kind === "mutation" && operation.method === "GET") {
    fail("INVALID_DEFINITION", `${path}.method`);
  }
  validateAccess(operation.access, `${path}.access`);
  if (
    operation.kind === "mutation" &&
    operation.idempotency?.required !== true
  ) {
    fail("INVALID_DEFINITION", `${path}.idempotency`);
  }
  if (operation.kind === "mutation" && operation.audit?.required !== true) {
    fail("INVALID_DEFINITION", `${path}.audit`);
  }
  if (!operation.rateLimit) fail("INVALID_DEFINITION", `${path}.rateLimit`);
  assertPositiveInteger(operation.rateLimit.cost, `${path}.rateLimit.cost`);
  assertPositiveInteger(operation.rateLimit.limit, `${path}.rateLimit.limit`);
  assertPositiveInteger(
    operation.rateLimit.windowMs,
    `${path}.rateLimit.windowMs`,
  );
}

function validatePage(page: FeaturePageDefinition, path: string): void {
  assertIdentifier(page.id, `${path}.id`);
  validateAccess(page.access, `${path}.access`);
  if (!page.routes.mobile && !page.routes.web)
    fail("INVALID_DEFINITION", `${path}.routes`);
  if (page.routes.mobile)
    assertRoute(page.routes.mobile.path, `${path}.routes.mobile.path`);
  if (page.routes.web) {
    assertRoute(page.routes.web.path, `${path}.routes.web.path`);
    assertRoute(
      page.routes.web.seo.canonicalPath,
      `${path}.routes.web.seo.canonicalPath`,
    );
    if (page.routes.web.path !== page.routes.web.seo.canonicalPath) {
      fail("INVALID_DEFINITION", `${path}.routes.web.seo.canonicalPath`);
    }
    assertNonEmpty(page.routes.web.seo.title, `${path}.routes.web.seo.title`);
    assertNonEmpty(
      page.routes.web.seo.description,
      `${path}.routes.web.seo.description`,
    );
  }
  if (page.root.kind !== "layout")
    fail("INVALID_DEFINITION", `${path}.root.kind`);
}

function validateAccess(
  access: FeaturePageDefinition["access"],
  path: string,
): void {
  if (access.mode === "public") return;
  if (access.permissions.length === 0)
    fail("INVALID_DEFINITION", `${path}.permissions`);
  for (const permission of access.permissions) {
    if (!PERMISSION.test(permission))
      fail("INVALID_DEFINITION", `${path}.permissions`);
  }
}

function validateNodeReferences(
  node: FeatureNode,
  blocks: ReadonlySet<string>,
  operations: ReadonlySet<string>,
  path: string,
): void {
  assertIdentifier(node.id, `${path}.id`);
  if (node.kind === "block") {
    if (!blocks.has(node.block)) fail("UNKNOWN_BLOCK", `${path}.block`);
    if (node.query && !operations.has(node.query))
      fail("UNKNOWN_OPERATION", `${path}.query`);
    for (const operation of Object.values(node.actions ?? {})) {
      if (!operations.has(operation))
        fail("UNKNOWN_OPERATION", `${path}.actions`);
    }
    return;
  }
  assertIdentifier(node.layout, `${path}.layout`);
  const childIds = new Set<string>();
  for (const child of node.children) {
    assertUnique(childIds, child.id, `${path}.children.${child.id}`);
    validateNodeReferences(
      child,
      blocks,
      operations,
      `${path}.children.${child.id}`,
    );
  }
}

function indexFeature(
  feature: FeatureDefinition,
  pages: Record<string, FeaturePageDefinition>,
  operations: Record<string, FeatureOperationDefinition>,
  routes: CompiledFeatureRoute[],
  routeKeys: Set<string>,
): void {
  for (const operation of feature.operations)
    operations[`${feature.id}.${operation.id}`] = operation;
  for (const page of feature.pages) {
    pages[`${feature.id}.${page.id}`] = page;
    if (page.routes.web) {
      addRoute(routes, routeKeys, {
        access: page.access,
        featureId: feature.id,
        pageId: page.id,
        path: page.routes.web.path,
        platform: "web",
        seo: page.routes.web.seo,
      });
    }
    if (page.routes.mobile) {
      addRoute(routes, routeKeys, {
        access: page.access,
        featureId: feature.id,
        pageId: page.id,
        path: page.routes.mobile.path,
        platform: "mobile",
      });
    }
  }
}

function addRoute(
  routes: CompiledFeatureRoute[],
  keys: Set<string>,
  route: CompiledFeatureRoute,
): void {
  const key = `${route.platform}:${route.path}`;
  if (keys.has(key)) fail("DUPLICATE_ROUTE", key);
  keys.add(key);
  routes.push(route);
}

function assertIdentifier(value: string, path: string): void {
  if (!IDENTIFIER.test(value)) fail("INVALID_DEFINITION", path);
}

function assertRoute(value: string, path: string): void {
  if (!ROUTE.test(value)) fail("INVALID_DEFINITION", path);
}

function assertNonEmpty(value: string, path: string): void {
  if (value.trim().length === 0 || value.length > 240)
    fail("INVALID_DEFINITION", path);
}

function assertPositiveInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    fail("INVALID_DEFINITION", path);
}

function assertUnique(values: Set<string>, value: string, path: string): void {
  if (values.has(value)) fail("DUPLICATE_ID", path);
  values.add(value);
}

function fail(
  code: ConstructorParameters<typeof FeatureDefinitionError>[0],
  path: string,
): never {
  throw new FeatureDefinitionError(code, path);
}

function deepFreeze<Value>(value: Value): Value {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
