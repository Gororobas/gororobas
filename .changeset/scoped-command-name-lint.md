---
'@foldkit/oxlint-plugin': patch
---

Recognize qualified Command names produced by an owning Block in the Command declaration and definition-name rules. The local name still must be a PascalCase literal and match its definition binding.

Add `foldkit/block-name-matches-variable` to the recommended and all presets. Literal `Block.makeDefinition` declarations use the `<BlockId>Definition` identifier: `const HomeDefinition = Block.makeDefinition('Home', ...)`. Inline and same-file `makeComposition` chains use `<BlockId>Composition`. Root authoring and Composition values use `ApplicationDefinition` and `ApplicationComposition`. The rule follows supported Foldkit API imports and aliases; it does not infer the identity of an authoring value imported from another local module.
