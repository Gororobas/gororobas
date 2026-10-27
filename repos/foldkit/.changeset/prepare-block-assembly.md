---
'foldkit': minor
---

Rename `Composition.assembleBlock` to `prepareBlock` and `Block.complete` to `Block.assemble`. Prepare an ordinary Block through a private zero-argument `prepare` producer and initialize its existing `Block.FromAssembly*<typeof Model, typeof prepare>` boundary with `Block.assemble(prepare)`.

For `foldkit/block` imports, rename the exported `complete` function to `assemble` and the `AssembleBlock` method type to `PrepareBlock`. The four `FromAssembly*` annotation types retain their names.

`Block.assemble` evaluates the producer exactly once while constructing passive configuration. It does not run init, construct Layers, or start effects. The explicit canonical Model header keeps parent Schema projections from forcing TypeScript through the entire implementation's inferred type graph. This can improve targeted checking and member completion; it does not eliminate all TypeScript latency.
