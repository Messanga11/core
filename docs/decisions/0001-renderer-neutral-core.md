# ADR 0001: Renderer-neutral core

Status: accepted

`@messanga11/core` shares JSON contracts, policies, state machines, view models, semantic runtime intentions, and renderer-neutral semantic design tokens. It never exports JSX, hooks, DOM handles, React Native types, platform styles, or design-system components.

The `@messanga11/core/design` subpath owns validated defaults and pure configuration. Consumer-owned adapters project those values to CSS variables, React Native styles, or another renderer. This keeps one configurable source without coupling the kernel to a platform.

Web and Native renderers are private integration fixtures. This resolves the universal-engine requirement without coupling the public kernel to two incompatible rendering runtimes.
