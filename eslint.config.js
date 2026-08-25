import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const FORBIDDEN_PLATFORM_IMPORTS = [
  "react",
  "react-dom",
  "react-native",
  "react-native-web",
  "@mui/*",
  "@chakra-ui/*",
  "tamagui",
  "gluestack-ui",
];

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.expo/**", "**/.next/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/*/src/**/*.ts"],
    rules: {
      "no-console": "error",
      "no-eval": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: FORBIDDEN_PLATFORM_IMPORTS,
              message:
                "Core must remain renderer-neutral; inject platform adapters instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/core/src/index.ts",
      "packages/core/src/contracts/**/*.ts",
      "packages/core/src/state/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@trpc/server",
                "zod",
                "../security/*",
                "../server/*",
                "../trpc/*",
              ],
              message:
                "Universal contracts and state cannot depend on server-only modules.",
            },
            {
              group: FORBIDDEN_PLATFORM_IMPORTS,
              message:
                "Universal contracts and state must remain renderer-neutral.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/core/src/security/**/*.ts",
      "packages/core/src/server/**/*.ts",
      "packages/core/src/server-entry.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@trpc/server",
                "../state/*",
                "../testing/*",
                "../trpc/*",
              ],
              message:
                "Server modules cannot depend on transport, state, or testing modules.",
            },
            {
              group: FORBIDDEN_PLATFORM_IMPORTS,
              message: "Server modules must remain renderer-neutral.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/core/src/trpc/**/*.ts"],
    ignores: ["packages/core/src/trpc/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../state/*", "../testing/*"],
              message:
                "The tRPC adapter cannot depend on state or testing modules.",
            },
            {
              group: FORBIDDEN_PLATFORM_IMPORTS,
              message: "The tRPC adapter must remain renderer-neutral.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/formbuilder/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
