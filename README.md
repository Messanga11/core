# Messanga11 Core Ecosystem

Provider-agnostic TypeScript packages for protected multi-tenant business operations, reference infrastructure adapters, and cross-platform integration fixtures.

The public kernel lives in `packages/core`. Concrete PostgreSQL, Redis, OIDC, and telemetry integrations are isolated in dedicated packages. Web and native renderers remain private fixtures.

| Package | Responsibility |
| --- | --- |
| `@messanga11/core` | JSON contracts, policy, protected operations, state and tRPC |
| `@messanga11/tenancy` | Tenant, membership, invitation and ownership rules |
| `@messanga11/auth-oidc` | Strict OIDC/JWKS verification and session ports |
| `@messanga11/adapter-postgres` | PostgreSQL 18 migrations, RLS, outbox and tenancy unit of work |
| `@messanga11/adapter-redis` | Redis 8 Functions for rate limits, quotas and idempotency |
| `@messanga11/telemetry` | Redacted OpenTelemetry bridges |

## Validation

```sh
npm ci
npm run check
npm run typecheck
npm run test:coverage
npm run build
npm run check:packages
npm run check:tarballs
npm run check:fixtures
```

The fixture verification copies the Next.js and Expo shells to an isolated temporary workspace and installs `@messanga11/core` from its packed artifact. This prevents accidental validation through workspace source links.

## Install core from GitHub

Public releases expose the validated core tarball without requiring a GitHub or
npm token:

```sh
npm install --save-exact https://github.com/Messanga11/core/releases/download/core-v0.2.0/messanga11-core-0.2.0.tgz
```

See the [GitHub installation guide](docs/getting-started-from-github.md) for a
complete TypeScript and tRPC example.

PostgreSQL and Redis integration tests run when `POSTGRES_INTEGRATION_URL` and `REDIS_INTEGRATION_URL` are present. GitHub Actions supplies PostgreSQL 18 and Redis 8 services.
