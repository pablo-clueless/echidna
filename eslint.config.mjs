import perfectionist from "eslint-plugin-perfectionist";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import globals from "globals";

import echidna from "./tools/eslint/index.js";

export default defineConfig(
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/.turbo/**", "target/**", "packages/solver/wasm/**", "**/next-env.d.ts"],
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { perfectionist, echidna },
    rules: {
      "func-style": ["error", "expression"],
      "prefer-arrow-callback": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "perfectionist/sort-imports": [
        "error",
        {
          type: "line-length",
          order: "desc",
          internalPattern: ["^@/.+"],
          groups: [
            ["side-effect-style", "side-effect"],
            { newlinesBetween: 0 },
            ["builtin", "external"],
            ["internal", "parent", "sibling", "index"],
            "unknown",
          ],
          newlinesBetween: 1,
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "echidna/british-english": "error",
    },
    settings: { next: { rootDir: "apps/web" } },
  },
  {
    files: ["apps/web/components/**/*{Scene,Canvas}.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
  {
    files: ["apps/web/app/**/layout.tsx"],
    rules: { "func-style": "off" },
  },
  {
    files: ["apps/web/components/ui/**"],
    rules: { "func-style": "off", "perfectionist/sort-imports": "off" },
  },
  {
    files: ["apps/web/messages/en.json"],
    language: "json/json",
    plugins: { json, echidna },
    rules: { "echidna/british-english": "error" },
  },
);
