# ADR 0006: executable feature catalog

Status: accepted

## Context

Separate route, UI, permission and backend registries drift and allow a generated
client to describe behavior the trusted server does not enforce. Product families
also need to add pages, layouts and domain operations without changing Core.

## Decision

Core exposes a JSON-safe, renderer-neutral `FeatureCatalogDefinition`. Each
versioned feature owns its pages, Web/Mobile routes, truthful SEO, page access,
semantic layout/block tree and operation contracts. Operations declare method,
access, strict input/output schemas, handler identifier, rate limit, audit and
idempotency. Mutations without required audit and idempotency do not compile.

The universal compiler validates and freezes the catalog. Framework generators
consume its route projection. Renderers resolve semantic identifiers through
project-owned registries. The server runtime resolves the same operation projection
through injected security ports and an allowlisted handler registry.

## Boundaries

Core never imports React, DOM, React Native, Next.js, Expo, Refine, an ORM or a
database driver. Catalogs contain no executable handlers or vendor objects.
Composition roots bind handlers and adapters. Unknown identifiers and dependency
failures are denied.

## Evolution

New blocks, layouts and domain operations extend project registries without
changing Core. Catalog schema changes use `schemaVersion`; feature compatibility
uses SemVer. Runtime ingestion of tenant-authored catalogs is out of scope until a
signed, sandboxed and separately audited distribution format exists.
