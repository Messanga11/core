# @messanga11/core

## 0.6.0

### Minor Changes

- [`cb0aeef`](https://github.com/Messanga11/core/commit/cb0aeef103e89fabc880f469b1483c18fb72cdee) Thanks [@Messanga11](https://github.com/Messanga11)! - Add versioned capability-pack compilation and artifact generation, advanced feature schemas and dynamic route contracts, tenant-scoped optimistic CRUD contracts, generic PostgreSQL feature persistence with forced RLS, leased outbox processing with retries and dead letters, OpenAPI generation, OIDC Authorization Code + PKCE server primitives, and tenant-scoped opaque session persistence with absolute and inactivity expiry.

## 0.5.0

### Minor Changes

- Generate protected CRUD operation contracts from declarative feature resources.

  Add a generic SQLite feature-resource adapter with allowlisted JSON fields,
  development seeds, pagination, filtering, sorting and persistent idempotency.

## 0.4.0

### Minor Changes

- Add executable, renderer-neutral feature catalogs for declaring pages, layouts,
  blocks, SEO, platform routes and backend operations from one TypeScript object.
- Add a fail-closed feature operation runtime with strict schema validation,
  permission checks, rate limiting, idempotency and mandatory mutation auditing.

## 0.3.1

### Patch Changes

- Allow the companion GitHub release tarballs to reuse an explicitly installed Core package without requiring registry access.

## 0.3.0

### Minor Changes

- Add renderer-neutral `@messanga11/core/forms` contracts, validation and state.
- Add provider-neutral `@messanga11/core/crud` resource and port contracts.
- Add the separately published FormBuilder, Refine.dev and SQLite adapters.

## 0.2.1

### Patch Changes

- Add the renderer-neutral `@messanga11/core/design` entry point with validated,
  immutable defaults and configurable semantic token overrides.
