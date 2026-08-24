# Threat model

## Assets and trust boundaries

- Tenant data, membership authority, session hashes, invitation hashes, quotas, audit records, and domain events are protected assets.
- Browser and mobile inputs, OIDC claims, HTTP headers, database responses, Redis responses, and event deliveries are untrusted until validated.
- Only the protected-operation pipeline may issue an `AccessGrant`; persistence services require that runtime proof before an effect.

## Primary threats and controls

- Broken access control and IDOR: tenant IDs come from validated context, resources are queried tenant-first, policies deny unknown states, and public errors avoid enumeration.
- Token and session theft: OIDC signatures and claims are allowlisted; web cookies are HttpOnly/Secure/SameSite; mobile session material uses secure storage; only hashes are persisted.
- Replay and race conditions: mutations require idempotency keys and expected versions; invitations are single-use; Redis Functions and PostgreSQL transactions enforce atomic transitions.
- Injection: Zod validates boundaries, SQL uses positional parameters, Redis function names are internal constants, and external URLs require HTTPS.
- Dual-write loss: mutations and domain events share a PostgreSQL transaction and outbox.
- Information disclosure: client errors are opaque and telemetry excludes raw errors, actors, tenants, tokens, claims, and payloads.
- Supply chain compromise: lockfile installs, dependency audit, explicit exports, tarball inspection, provenance, and protected release environments are mandatory gates.

## Residual risks

- The Expo 57 toolchain currently carries moderate transitive npm advisories through its build tooling; no high or critical advisory is present and npm proposes only an invalid downgrade. Track upstream fixes before promoting the fixture to a production app.
- Local integration tests require a running PostgreSQL 18 and Redis 8. CI is authoritative when Docker is unavailable locally.
- OIDC configuration, TLS termination, database roles, Redis ACLs, key rotation, backups, and alert routing remain deployment responsibilities of the consuming system.
