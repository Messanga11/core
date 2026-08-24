import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  external: ["@messanga11/core", "zod"],
});
