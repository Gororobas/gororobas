---
'foldkit': minor
'@foldkit/ui': patch
'create-foldkit-app': patch
---

Add checked assembly type headers so a feature can export only its completed Block while parents compose its Model Schema without inferring the whole implementation first. Capture the existing assembly in a plain zero-argument producer and annotate its export with the matching `Block.FromAssemblyWithView`, `Block.FromAssemblyWithViewAndOutMessage`, `Block.FromAssemblyWithOutMessage`, or `Block.FromAssemblyWithoutViewOrOutMessage` type. The local Model Schema fixes the header; every other member retains the producer's exact contract.

Keep all assembly validation, Command and Service requirements, constructor errors, registration evidence, and view and OutMessage capabilities. The new types reject incompatible headers and invalid producers; the annotation neither replaces the runtime Schema object nor starts effects. Public declaration support interfaces preserve portable inferred consumers.

Apply the boundary to ordinary examples, Website, Typing Game, scaffolds, and inferred UI exports. Preserve existing explicit generic UI contracts and public Model exports. Update active organization, migration and skill guidance. Root member completion and hover improve materially in the measured native TypeScript workload; full type expansion remains expensive and root diagnostics regress. This does not claim universal editor responsiveness or memory stability.
