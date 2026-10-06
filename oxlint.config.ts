import effect from "@mpsuesser/oxlint-plugin-effect"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [
    {
      ...effect.configs.recommended,
      ignorePatterns: ["./linting/**/*.mjs"],
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
  plugins: ["import", "vitest", "react", "eslint", "typescript", "unicorn", "react-perf", "node"],
  jsPlugins: [
    "./linting/index.mjs",
    {
      name: "foldkit",
      specifier: "@foldkit/oxlint-plugin",
    },
  ],
  options: {
    typeAware: true,
  },
  rules: {
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
    "foldkit/no-noop-message": "error",
    "foldkit/got-submodel-message-name": "error",
    "foldkit/got-prefix-requires-submodel-payload": "error",
    "foldkit/no-empty-object-tagged-call": "error",
    "foldkit/prefer-callable-message-constructor": "error",
    "foldkit/command-binding-matches-name": "error",
    "foldkit/no-module-level-mutable-state": "error",
  },
  overrides: [
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
      files: ["apps/server/src/durable-streams/router.ts", "apps/server/test/durable-streams/**"],
      rules: {
        "custom-lint-rules/no-direct-fetch": "off",
      },
    },
    {
      files: ["packages/effect-bdd/**/*", "**/*.test.ts", "apps/server/test/**/*"],
      rules: {},
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
        "effect/avoid-option-getorthrow": "off",
        "effect/avoid-untagged-errors": "off",
        "effect/avoid-direct-json": "off",
      },
    },
    {
      files: ["**/*.mjs"],
      rules: {},
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
    "linting/**",
    "oxlint.config.ts",
    "vitest.shared.ts",
    "apps/server/scripts/test-auth.ts",
    "packages/migration/src/gel",
    "packages/migration/src/gel.interfaces.ts",
  ],
})
