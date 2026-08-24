# @messanga11/telemetry

OpenTelemetry bridge for the Messanga11 protected-operation ports. It records only allowlisted operational dimensions and never emits raw errors, actors, tenants, tokens, or business payloads.

This package uses the global OpenTelemetry API. Configure an SDK in the consuming server, then wrap the core audit and reporter ports with the exported factories.
