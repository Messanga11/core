# `@messanga11/adapter-sqlite`

Development-only SQLite implementation of `CrudPort`. Resources, tables and
columns are explicitly allowlisted at composition time. Values remain bound SQL
parameters; unknown resource and field names fail closed.

Create the schema in the application startup or migration layer, then pass the
open `better-sqlite3` database and the allowlist to `createSqliteCrudAdapter`.

For generated feature resources, use `createSqliteFeatureResourceAdapter`. It
creates a development envelope table, partitions records by the compiled resource
identifier, applies an allowlisted JSON field model and persists idempotency
results. Optional development seeds are inserted once. Production applications
should inject a durable production `CrudPort` such as the Postgres adapter.
