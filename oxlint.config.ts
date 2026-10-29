import { recommended as effectTsgoRecommended } from "@effect/tsgo/oxlint-presets"
import foldkit from "@foldkit/oxlint-plugin"
import effect from "@mpsuesser/oxlint-plugin-effect"
import { defineConfig } from "oxlint"

import designSystem from "./linting/design-system.mjs"

export default defineConfig({
  extends: [
    effectTsgoRecommended,
    {
      ...foldkit.configs.recommended,
      rules: {},
      overrides: [
        { files: ["apps/web-app/**"], rules: foldkit.configs.recommended.rules },
        ...foldkit.configs.recommended.overrides.map((override) => ({
          ...override,
          files: override.files.map((pattern) => `apps/web-app/${pattern}`),
        })),
      ],
    },
    {
      ...effect.configs.recommended,
      rules: {
        ...effect.configs.recommended.rules,
        "effect/prefer-effect-fn": "off",
        "effect/require-schema-type-alias": "off",
        "effect/effect-run-in-body": "off",
        "effect/prefer-arr-sort": "off",
        "effect/no-barrel-imports": "off",
        "effect/prefer-namespace-imports": "off",
        "effect/avoid-ts-ignore": "off",
        "effect/no-service-constructor-imports": "off",
        "effect/prefer-option-over-null": "off",
        "effect/no-conditional-empty-object-spread": "off",
        "effect/no-shape-in-symbol-names": "off",
      },
    },
  ],
  plugins: ["import", "vitest", "eslint", "typescript", "unicorn", "node"],
  jsPlugins: ["./linting/index.mjs", "./linting/design-system.mjs"],
  options: {
    typeAware: true,
  },
  rules: {
    "custom-lint-rules/module-import-boundaries": "error",
    "custom-lint-rules/no-stringified-errors": "error",
    "custom-lint-rules/no-literal-styles-outside-theme": "error",
    "custom-lint-rules/no-duplicate-constants": "error",
    "effecttsgo/unstable-api-usage": "off",
    "effecttsgo/schema-class-missing-brand": "off",
    "typescript/restrict-template-expressions": "off",
    "custom-lint-rules/no-schema-decode-unknown": "error",
    curly: ["error", "multi-line"],
    "custom-lint-rules/no-node-apis": "error",
    "custom-lint-rules/no-function-aliases": "error",
    "custom-lint-rules/no-many-function-parameters": "error",
    "custom-lint-rules/no-inline-imports": "error",
    "custom-lint-rules/padding-around-large-statements": "error",
    "unicorn/filename-case": ["error", { case: "kebabCase" }],
    yoda: ["error", "never", { exceptRange: true }],
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        fix: {
          imports: "fix",
          variables: "suggestion",
        },
      },
    ],
    "typescript/no-unnecessary-boolean-literal-compare": "off",
    "vitest/no-standalone-expect": "off",
    "vitest/valid-title": "off",
    "custom-lint-rules/no-disable-validation": "error",
    "custom-lint-rules/no-sql-type-parameter": "error",
    "custom-lint-rules/prefer-option-from-nullable": "error",
    "custom-lint-rules/prefer-arr-sort": "error",
    "custom-lint-rules/require-effect-vitest": "error",
    "custom-lint-rules/no-direct-fetch": "error",
    "custom-lint-rules/pipe-max-arguments": "error",
    "custom-lint-rules/no-nested-layer-provide": "error",
    "custom-lint-rules/no-direct-id-construction": "error",
    "custom-lint-rules/tagged-error-suffix": "error",
    "custom-lint-rules/service-map-class-suffix-by-file": "error",
    "custom-lint-rules/require-canonical-module-names": "error",
    "custom-lint-rules/require-effect-alias-for-es-namespaces": "error",
  },
  overrides: [
    {
      files: [
        "packages/effect-bdd/src/feature/describe-feature.ts",
        "packages/effect-bdd/src/steps/run-steps.ts",
      ],
      // The runner erases heterogeneous step errors and services after the public overloads validate their composition.
      rules: { "effecttsgo/any-unknown-in-error-context": "off" },
    },
    { files: ["apps/*/src/**", "packages/*/src/**"], rules: { "import/no-cycle": "error" } },
    {
      files: ["linting/**"],
      rules: {
        ...Object.fromEntries(
          Object.keys(effect.configs.recommended.rules).map((rule) => [rule, "off" as const]),
        ),
        "custom-lint-rules/no-node-apis": "off",
        "custom-lint-rules/no-many-function-parameters": "off",
        "custom-lint-rules/padding-around-large-statements": "off",
      },
    },

    {
      files: ["packages/migration/**"],
      rules: { "custom-lint-rules/no-schema-decode-unknown": "off" },
    },
    {
      files: ["apps/web-app/**/*"],
      rules: {
        ...Object.fromEntries(
          Object.keys(designSystem.rules).map((name) => [
            `design-system/${name}`,
            "error" as const,
          ]),
        ),
      },
    },

    {
      files: ["packages/migration/src/**/*preview*", "packages/migration/preview/**"],
      rules: Object.fromEntries(
        Object.keys(effect.configs.recommended.rules).map((rule) => [rule, "off" as const]),
      ),
    },
    {
      files: ["apps/server/src/db/migrations-effect/**"],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
    {
      files: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/test/**/*.ts",
        "**/test/**/*.tsx",
      ],
      rules: {
        "effecttsgo/any-unknown-in-error-context": "off",
        "effecttsgo/global-error-in-effect-failure": "off",
        "custom-lint-rules/no-schema-decode-unknown": "off",
        "effect/avoid-option-getorthrow": "off",
        "effect/avoid-untagged-errors": "off",
        "effect/avoid-direct-json": "off",
      },
    },
  ],
  env: {
    builtin: true,
    es2018: true,
  },
  ignorePatterns: [
    "**/dist",
    "**/build",
    "**/docs",
    "**/*.md",
    "**/node_modules",
    "**/ios",
    "**/android",
    "**/coverage",
    "**/.git",
    "repos/**",
    "**/repos/**",
    ".agents/**",
    "experiments/**",
    "scratchpad/**",
    "oxlint.config.ts",
    "vitest.shared.ts",
    "apps/server/scripts/test-auth.ts",
    "packages/migration/src/gel",
    "packages/migration/src/gel.interfaces.ts",
  ],
})
