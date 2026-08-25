import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    crud: "src/crud/index.ts",
    design: "src/design/index.ts",
    events: "src/events/index.ts",
    forms: "src/forms/index.ts",
    index: "src/index.ts",
    policy: "src/policy/index.ts",
    server: "src/server-entry.ts",
    state: "src/state/index.ts",
    testing: "src/testing/index.ts",
    trpc: "src/trpc/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
});
