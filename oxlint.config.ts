import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [],
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
    "vitest/valid-title": "off",
    "custom-lint-rules/no-disable-validation": "error",
    "custom-lint-rules/no-sql-type-parameter": "error",
    "custom-lint-rules/prefer-option-from-nullable": "error",
    "custom-lint-rules/prefer-arr-sort": "error",
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
      files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts", "**/test/**/*.tsx"],
      rules: {},
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
    "oxlint.config.ts",
    "vitest.shared.ts",
    "apps/server/scripts/test-auth.ts",
    "packages/migration/src/gel",
    "packages/migration/src/gel.interfaces.ts",
  ],
})
