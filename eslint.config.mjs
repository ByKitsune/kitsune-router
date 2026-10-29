import { defineConfig, globalIgnores } from "eslint/config";
import { fixupPluginRules } from "@eslint/compat";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import * as espree from "espree";
import noLocationAssignRelativeDestination from "./scripts/eslint/no-location-assign-relative-destination.mjs";

const eslintConfig = defineConfig([
  {
    // These plugins still use legacy rule APIs removed in ESLint 10.
    // Keep their actual implementations, adapting only that ESLint API boundary.
    plugins: {
      react: fixupPluginRules(react),
      "react-hooks": fixupPluginRules(reactHooks),
      import: fixupPluginRules(importPlugin),
      "jsx-a11y": fixupPluginRules(jsxA11y),
      kitsunerouter: {
        rules: { "no-location-assign-relative-destination": noLocationAssignRelativeDestination },
      },
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: espree,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true, globalReturn: false },
      },
    },
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: "detect" } },
    // Oxlint owns the other 21 Next policies. Keep the existing React,
    // hooks, import, accessibility, and project navigation policy in ESLint.
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "import/no-anonymous-default-export": "warn",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      "kitsunerouter/no-location-assign-relative-destination": "warn",
    },
  },
  {
    // The CommonJS launcher intentionally returns early at top level. Keep
    // that exception here, not across the ESM app and engine.
    files: ["cli/cli.js"],
    languageOptions: {
      sourceType: "commonjs",
      parserOptions: { sourceType: "script", ecmaFeatures: { globalReturn: true } },
    },
  },
  // Match nested workspaces too; generated output is not source policy input.
  globalIgnores([
    "**/.next/**",
    "**/.next-cli-build/**",
    "**/out/**",
    "**/build/**",
    "verification/ui-playwright/**",
    "next-env.d.ts",
  ]),
  // Data-definition modules intentionally use anonymous default exports:
  // provider registries are single-object descriptors consumed via the
  // auto-generated static import list (see open-sse/AGENTS.md), and DB
  // migrations export a single migration descriptor. Naming each one adds
  // churn with no debuggability gain, so the rule is scoped off here.
  {
    files: ["open-sse/**/*.js", "src/lib/**/*.js"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
  {
    // Runtime identifier checks apply only to the app and engine, not every
    // script in the repository. Preserve the existing explicit readonly globals.
    files: ["src/**/*.{js,jsx}", "open-sse/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        queueMicrotask: "readonly",
        structuredClone: "readonly",
        crypto: "readonly",
        globalThis: "readonly",
      },
    },
    rules: { "no-undef": "error" },
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
