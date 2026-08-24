# ADR 0004: Domain events and transactional outbox

Status: accepted

Domain events use a versioned JSON-safe envelope. Mutations and outbox records commit in the same persistence transaction; publishing after a separate save is forbidden.

Audit and domain events are separate streams. Event payloads are minimal and exclude tokens, invitation targets, email addresses, and raw request payloads. Consumers are idempotent by event ID and aggregate version.
