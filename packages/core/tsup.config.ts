import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    events: "src/events/index.ts",
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
