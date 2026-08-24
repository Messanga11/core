# Workspace instructions

All package implementations must follow the architectural guardrails in the nearest package-level `AGENTS.md`.

- Keep public packages provider-agnostic unless the package is explicitly an adapter.
- Search existing symbols with `rg` before introducing a new pattern.
- Use strict TypeScript, Zod validation at external boundaries, and fail-closed security paths.
- Run formatting, lint, type checks, tests, builds, and tarball checks before handoff.
- Never expose secrets, tokens, PII, internal exceptions, or vendor types through public contracts.
