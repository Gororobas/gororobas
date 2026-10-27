---
'@foldkit/oxlint-plugin': minor
---

Add `foldkit/no-completed-block-model-in-schema` to the recommended lint configuration. Compose parent Schemas through a checked explicit Block assembly header, or use a feature's intentional canonical public Model export. Public Block Model access and ordinary type annotations remain supported.

The rule follows proven Foldkit assembly, immutable aliases and explicit relative TypeScript exports. It recognizes the four checked assembly headers, while rejecting known widened aliases and headers derived from an inferred Block Model. It tracks the raw Block results of `provideHandlers` and `replaceEffectsLayer`. Unknown factories and unsupported import patterns remain outside this syntax and provenance guardrail; it is not a type-safety guarantee, and no import autofix is guessed.

Use a runtime `oxc-parser` dependency to inspect imported modules without executing them. Node support is `^20.19.0 || >=22.12.0`, matching that parser.
