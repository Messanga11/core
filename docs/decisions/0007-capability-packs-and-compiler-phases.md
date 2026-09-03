# ADR 0007: Capability packs and compiler phases

## Status

Accepted.

## Decision

Core owns a small, versioned feature contract and compiles only capability packs explicitly selected by the host application. A pack declares its manifest, dependencies, features, semantic hooks, generators, migration descriptors, secured handlers and validation diagnostics. Unknown packs, missing dependencies, incompatible catalog versions and identifier collisions fail compilation.

The compilation boundary is `parse → validate → normalize → authorize → generate → execute`. Generated handlers are data-plane dependencies of the existing guarded feature runtime; a pack never invokes them outside that runtime. Authentication, trusted tenant context, validation, quota/rate limit, audit intent and idempotency remain host-enforced invariants.

Generators return confined relative artifacts. Absolute paths, traversal segments, duplicate outputs and oversized content are rejected before a host writes files. Migration payloads are provider-neutral descriptors; database adapters translate them into reviewable migrations.

## Consequences

- New product domains can be shipped without editing Core.
- Presets are allowlists, not implicit plugin discovery.
- A custom/ejected handler keeps the same operation contract and security envelope.
- Generated output is deterministic and can be checked for uncommitted drift in CI.
- Capability code is trusted application code, but its authority remains bounded by the runtime ports supplied by the host.
