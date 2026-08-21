import effect from "@mpsuesser/oxlint-plugin-effect"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [
    {
      ...effect.configs.recommended,
      rules: {
        ...effect.configs.recommended.rules,
        "effect/require-schema-type-alias": "off",
        "effect/prefer-effect-fn": "off",
        "effect/no-barrel-imports": "off",
        "effect/prefer-namespace-imports": "off",
        "effect/avoid-ts-ignore": "off",
        "effect/avoid-direct-tag-checks": "off",
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
    "custom-lint-rules/no-disable-validation": "error",
    "custom-lint-rules/no-sql-type-parameter": "error",
    "custom-lint-rules/prefer-option-from-nullable": "error",
    "custom-lint-rules/no-direct-fetch": "error",
    "custom-lint-rules/pipe-max-arguments": "error",
    "custom-lint-rules/no-nested-layer-provide": "error",
    "custom-lint-rules/no-direct-id-construction": "error",
    "custom-lint-rules/tagged-error-suffix": "error",
    "custom-lint-rules/service-map-class-suffix-by-file": "error",
    "foldkit/no-noop-message": "error",
    "foldkit/got-submodel-message-name": "error",
    "foldkit/message-binding-matches-tag": "error",
    "foldkit/got-prefix-requires-submodel-payload": "error",
    "foldkit/no-empty-object-tagged-call": "error",
    "foldkit/prefer-callable-message-constructor": "error",
    "foldkit/command-binding-matches-name": "error",
    "foldkit/no-module-level-mutable-state": "error",
  },
  overrides: [
    {
      files: ["packages/server/src/db/migrations-effect/**"],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
    {
      files: [
        "packages/server/src/durable-streams/router.ts",
        "packages/server/test/durable-streams/**",
      ],
      rules: {
        "custom-lint-rules/no-direct-fetch": "off",
      },
    },
    {
      files: ["packages/effect-bdd/**/*", "**/*.test.ts", "packages/server/test/**/*"],
      rules: {
        "effect/effect-run-in-body": "off",
      },
    },
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts", "**/test/**/*.tsx"],
      rules: {
        "effect/avoid-option-getorthrow": "off",
      },
    },
    {
      files: ["**/*.mjs"],
      rules: Object.fromEntries(
        Object.entries(effect.configs.recommended.rules).map(([key]) => [key, "off"] as const),
      ),
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
    "oxlint.config.ts",
    "packages/server/scripts/test-auth.ts",
  ],
})
