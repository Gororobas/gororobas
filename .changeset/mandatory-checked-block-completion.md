---
'foldkit': minor
'@foldkit/ui': minor
'@foldkit/devtools': patch
'create-foldkit-app': patch
'@foldkit/oxlint-plugin': patch
'@foldkit/vite-plugin': patch
---

Require checked assembly before a completed Block can be used.

`Composition.prepareBlock` now returns an opaque draft. Keep the assembly in a private zero-argument `prepare` producer and initialize the matching `Block.FromAssembly*<typeof Model, typeof prepare>` export with `Block.assemble(prepare)`. The explicit canonical Model header keeps parent Schema projections from forcing TypeScript through the entire implementation's inferred type graph. This can improve targeted checking and member completion; it does not eliminate all TypeScript latency. `Block.assemble` evaluates the producer exactly once while constructing passive configuration and does not run init, construct Layers, or start effects. Bindings, Programs, and server rendering reject unfinished drafts; Layer replacement and host-handler provision preserve completed Blocks.

Update UI factories, scaffolds, lint recognition, and current guidance to use this assembly boundary. Assembly remains passive and preserves the original Block's metadata and precise requirements.

Fix Program Flags validation for dynamic checked-Block unions so every possible root initializer must accept exactly the hosted Flags.
