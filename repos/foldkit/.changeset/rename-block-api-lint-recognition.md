---
'@foldkit/oxlint-plugin': minor
---

Recognize the renamed Block and Program authoring APIs. Block naming diagnostics now distinguish `makeNamespace`, `makeDefinition`, and `makeComposition` stages, assembly-aware rules follow `prepareBlock` and `Block.assemble`, and host-boundary rules recognize `Program.make` and `Program.makeElement`.
