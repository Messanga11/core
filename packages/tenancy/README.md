# `@messanga11/tenancy`

Provider-agnostic tenant, membership, role, and invitation domain for Messanga11 applications.

All mutations are tenant-scoped, idempotent, optimistic-concurrency checked, and append their domain event through the same transaction port. Invitation token generation and hashing are injected; only hashes enter persistence.

```ts
import { createTenancyService } from "@messanga11/tenancy";

const tenancy = createTenancyService({ clock, crypto, ids, unitOfWork });
```

Requires Node.js 22 or newer.
