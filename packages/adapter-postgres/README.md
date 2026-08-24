# `@messanga11/adapter-postgres`

Server-only PostgreSQL 18 reference adapter for `@messanga11/tenancy`.

It provides tenant-scoped transactions, parameterized repositories, RLS migrations, advisory-locked migrations, idempotency storage, and an outbox consumer based on `FOR UPDATE SKIP LOCKED`.

Application database roles must not receive `BYPASSRLS` or ownership of the protected tables.
