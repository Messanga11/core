# ADR 0001: Renderer-neutral core

Status: accepted

`@messanga11/core` shares JSON contracts, policies, state machines, view models, and semantic runtime intentions. It never exports JSX, hooks, DOM handles, React Native types, platform styles, or design-system components.

Web and Native renderers are private integration fixtures. This resolves the universal-engine requirement without coupling the public kernel to two incompatible rendering runtimes.
