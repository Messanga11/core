# `@messanga11/formbuilder`

Headless React runtime for definitions from `@messanga11/core/forms`.

The package owns form orchestration through TanStack Form. It renders no HTML or
React Native primitive: applications inject a `FormRenderer`. A shared feature
therefore declares its fields, validation and submission once, while the Web and
Native engines decide how controls, layout, focus, uploads and accessibility are
rendered.

Definitions may contain static options and named `optionsSource` values. Network
functions, DOM `File` objects and platform props stay in the renderer or an
application adapter.
