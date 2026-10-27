---
'@foldkit/oxlint-plugin': patch
---

Disable `require-yield` in the recommended preset. Foldkit handler constructors use generator syntax because Foldkit applies `Effect.gen`; a constructor with no Service lookup intentionally has no `yield`. Consumers can re-enable the rule in their own config.
