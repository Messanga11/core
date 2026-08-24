# ADR 0003: Tenant vocabulary and permissions

Status: accepted

`tenant` is the canonical contract term. `organization` may be used only as localized product copy.

Human roles start as owner, admin, member, and viewer, but protected operations authorize effective namespaced permissions. Service identities receive explicit scopes and never inherit human roles implicitly. The final owner invariant is enforced atomically by persistence.
