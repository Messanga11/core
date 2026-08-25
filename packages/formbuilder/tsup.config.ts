import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
  external: [
    "@messanga11/core",
    "@messanga11/core/forms",
    "@tanstack/react-form",
    "react",
  ],
});
