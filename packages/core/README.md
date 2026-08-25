# @Messanga11/core

Headless, cross-platform business kernel for Messanga11 applications. It centralizes serializable UI contracts, optimistic state, input validation, tenant-aware authorization, quotas, rate limits, audit events, safe errors, and tRPC integration without importing React, DOM, React Native, an ORM, or a UI vendor.

The npm identifier is lowercase because npm package names cannot contain uppercase letters.

## Installation

Depuis une GitHub Release publique, sans token :

```sh
npm install --save-exact https://github.com/Messanga11/core/releases/download/core-v0.3.1/messanga11-core-0.3.1.tgz
```

Voir le [guide de démarrage depuis GitHub](../../docs/getting-started-from-github.md)
pour créer un projet TypeScript, exécuter une première opération protégée et
brancher tRPC.

Une fois une version publiée sur npm, l'installation équivalente sera :

```sh
npm install @messanga11/core zod
```

Install the optional peer only when using the tRPC adapter:

```sh
npm install @trpc/server
```

## Public entry points

| Entry point | Responsibility |
| --- | --- |
| `@messanga11/core` | Serializable `uiMeta`, operation envelopes, public errors, and UI runtime contracts |
| `@messanga11/core/crud` | Provider-neutral resource, filter, sort, pagination and CRUD port contracts |
| `@messanga11/core/forms` | JSON-safe form definitions, issues, validation and pure state transitions |
| `@messanga11/core/state` | Exhaustive query/command states and optimistic state reducer |
| `@messanga11/core/server` | Zod identifiers, request context, ports, access grants, and protected operations |
| `@messanga11/core/trpc` | Guarded tRPC query/mutation factory with safe error mapping |
| `@messanga11/core/testing` | Deterministic contexts and in-memory ports for tests only |

## Protected execution

Every protected operation follows the same fail-closed path:

```text
authenticated context
  → required permission
  → resource scope
  → Zod input validation
  → quota reservation
  → rate limit
  → mutation intent audit
  → handler with opaque AccessGrant
  → quota commit/release
  → result audit
```

Ports are injected by the host application. The package never imports a database, identity provider, cache, queue, or telemetry vendor.

## Shared forms

Declare steps and fields once with `@messanga11/core/forms`. Render them through
`@messanga11/formbuilder`, which accepts an injected Web or Native renderer.
Platform props, DOM `File` objects and network functions never enter the form
definition. Web applications may bridge CRUD through
`@messanga11/adapter-refine`; local development servers may use the separately
published `@messanga11/adapter-sqlite`.

```ts
import { z } from "zod";
import { createProtectedOperation } from "@messanga11/core/server";
import {
  createTestContext,
  createTestPorts,
} from "@messanga11/core/testing";

const { ports } = createTestPorts();
const readProfile = createProtectedOperation({
  name: "profile.read",
  kind: "query",
  permission: "profile.read",
  schema: z.object({ profileId: z.string().min(1) }).strict(),
  ports,
  handler: async ({ profileId }, { access }) => ({
    profileId,
    tenantId: access.tenantId,
  }),
});

const result = await readProfile.execute({
  context: createTestContext(),
  input: { profileId: "profile:1" },
});
```

`createTestPorts` is deliberately exported from `/testing`; production applications must provide atomic, distributed adapters appropriate to their infrastructure.

## Documentation

- [Product requirements](docs/product/okr-prd.md)
- [Architecture](docs/architecture/design-doc.md)
- [Technology boundaries](docs/architecture/technology-boundaries.md)
- [Authentication and authorization](docs/security/authentication-authorization.md)
- [Delivery process](docs/engineering/delivery-process.md)
- [Package deployment](docs/deployment/deployment.md)
- [Launch and incident plan](docs/launch/launch-plan.md)
- [Security reporting](SECURITY.md)

## Development

```sh
npm ci
npm run check
npm run typecheck
npm run test:coverage
npm run check:package
```

The implementation is operational locally and in CI. Public GitHub Release
tarballs require no consumer token. Publishing to npm remains intentionally
gated until the npm Trusted Publisher and release approval are configured.
