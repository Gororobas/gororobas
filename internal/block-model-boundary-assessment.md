# Completed Block Model boundary assessment

## Decision

Use a checked assembly producer/header for ordinary completed Block exports. Keep each feature's canonical Model Schema private and let parents compose `ChildBlock.Model`. The runtime API, Composition stages and lifecycle ownership stay unchanged.

The preferred owned assembler and the single conditional header both passed initial source checks but repeatedly made the real Website route workload slower. They are not implemented. Four shape-specific aliases give TypeScript the Model header directly without evaluating whether the completed implementation has a default view or OutMessage Schema first.

This is a material completion improvement with a diagnostic tradeoff. It is not a claim that every large composition is responsive, or that a bounded benchmark proves long-running memory stability.

## Consumer code

The canonical-import control requires another feature export and parent import:

```ts
// settings/index.ts
export { SettingsBlock } from './block'
export { Model } from './model'

// parent/model.ts
import * as Settings from './settings'

export const Model = Schema.Struct({ settings: Settings.Model })
```

The selected boundary keeps the completed value as the feature's public surface:

```ts
// settings/block.ts
import type { Block } from 'foldkit'

import { SettingsComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { update } from './update'
import { view } from './view'

const assemble = () => SettingsComposition.assembleBlock({ init, update, view })
export const SettingsBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof assemble
> = assemble()

// settings/index.ts
export { SettingsBlock } from './block'

// parent/model.ts
import { SettingsBlock } from './settings'

export const Model = Schema.Struct({ settings: SettingsBlock.Model })
```

The example declares no OutMessage. A Definition that declares OutMessage selects `FromAssemblyWithViewAndOutMessage`. Without a default view, use `FromAssemblyWithOutMessage` or `FromAssemblyWithoutViewOrOutMessage`. Assembly still validates the implementation before it returns. The annotation does not replace the Schema object or construct Layers.

The extra producer is local to final assembly. Contract, behavior and view files import their local Definition or Composition, never their own completed barrel. The Model import in assembly is type-only. Existing explicit generic UI contracts and extensions retain their purposeful boundaries; they are not mechanically rewritten.

## Evidence and comparison

The control is the optimized local checkpoint based on `6724d0b2f4996dfdcefa8abae0fd278c0a8f2717`, including the provisional canonical Model imports. It is not the older slow baseline from issue #1737. Both frozen arms contain identical Website assembly payloads and parent relationships. Each arm gets coherent freshly built core/UI declarations. Measurements use official native TypeScript 7.1.0-beta, the same LSP requests, semantic checks and unchanged limits, without Go GC or memory overrides.

Three alternating pairs, twelve workloads per pair, passed all 72 fresh-process sessions. The larger workload places the Website root twice under one parent.

| Post-edit operation                          | Canonical control median | Checked header median |
| -------------------------------------------- | -----------------------: | --------------------: |
| Root member completion                       |                  2,770ms |                 181ms |
| Root hover                                   |                  2,776ms |                 181ms |
| Larger parent member completion              |                  3,507ms |                 151ms |
| Actual ChangedUrl completion                 |                    269ms |                 280ms |
| Actual ChangedUrl hover                      |                    259ms |                 290ms |
| Root error appearance                        |                  2,739ms |               3,287ms |
| Root error clearing                          |                  2,738ms |               3,273ms |
| Full Message selection and resolution        |                  2,703ms |               2,647ms |
| Larger EffectsLayer selection and resolution |                  3,556ms |               3,402ms |

Root diagnostics regress about 20%; larger diagnostics regress about 20–24%. Full Message and EffectsLayer expansion remain expensive. The actual route stays sub-second with a small measured regression. Display-aware completion adapters account for the internal computed-symbol display difference; exact members and channels are verified independently through source and declarations.

A second final encoding shares the producer constraint across eight type heads. It has no demonstrated additional speed benefit and is retained to keep one implementation of the guard. Its actual-route screen remains around 0.3s.

A final sustained run requests completion, clean full diagnostics and full semantic tokens concurrently for twenty edit rounds in each arm:

| Operation        | Canonical median (range) | Selected median (range) |
| ---------------- | -----------------------: | ----------------------: |
| Root completion  |    3,187ms (3,057–3,512) |         188ms (162–391) |
| Full diagnostics |    3,193ms (3,068–3,519) |   3,549ms (3,358–3,778) |
| Semantic tokens  |    3,186ms (3,056–3,508) |   2,840ms (2,673–2,980) |

Completion remains fast while diagnostics and tokens are in flight. Full diagnostics are 11.1% slower in this run. Peak sampled RSS is 2,566/2,416MiB; both arms stay inside the unchanged 3GiB bound. Each arm is one process with correlated rounds, not twenty independent sessions. These bounded runs do not establish a general memory reduction or absence of leaks.

The actual integrated source, including barrel cleanup, type-only imports and UI headers, passes a final ten-session spotcheck after fresh core/UI builds. This is one proportional confirmation pair, not another repeated matrix:

| Operation                              |       Canonical | Actual integration |
| -------------------------------------- | --------------: | -----------------: |
| Root post-edit completion              |         2,665ms |              162ms |
| ChangedUrl completion                  |           247ms |              274ms |
| ChangedUrl hover                       |           279ms |              256ms |
| Root error appearance / clearing       | 2,649 / 2,641ms |    3,156 / 3,153ms |
| ChangedUrl error appearance / clearing |     606 / 581ms |        594 / 564ms |

All semantic payload, source-integrity, compiler-identity and unchanged-budget guards pass. This confirms the selected completion gain and root-diagnostic regression survive the real migration; it does not extrapolate to every consumer or the user's long-lived editor session.

## Safety and internal cost

The four aliases have four constrained public backing interfaces so inferred downstream declarations remain portable. This costs eight public type names and an explicit completed-member inventory. A single conditional alias regressed the measured route workload; it is not retained for surface symmetry.

The checked header preserves the exact Model Schema, Message/Codec channels, initializer and operation arguments, refined payloads, Commands, Services, constructor errors, handler completeness, host delegation, registration evidence and default-view/OutMessage distinctions. It rejects incompatible, broad, mutable, union, extra-member and overloaded producers. Whole-any aliases are unusable; invalid carrier members use an incompatible object rather than `never`, preventing erased producers from becoming usable Blocks.

Permanent source and emitted-package fixtures cover acceptance and rejection. Removing the plain-producer constraint invalidates two permanent source rejection controls; replacing the incompatible carrier with `never` invalidates two more. Separate exhaustive proof fixtures detect thirteen and seventeen such failures. Program rejection also has other constraints; it is not claimed to be independently sensitive to that poison mutation.

Strict whole-object Composition.Message equality fails in both raw and annotated emitted controls. Exact annotated-versus-raw identity, semantic members, required keys, Codec channels and baseline-outcome parity remain tested. This boundary does not create or hide that baseline failure.

Core external source, package emission and relocated consumers pass with `skipLibCheck: false`. The real unresolved-generic Toast factory also passes source, public emission and relocated consumption, with number/string Codec channels and its test extension retained. Existing generic Toast authoring is not migrated solely to exercise this helper.

The recommended lint rule flags proven unguarded completed Model dependencies in parent Schema construction. It recognizes the checked producer/header form, immutable aliases, explicit relative barrels and known raw-returning Block methods. It does not infer arbitrary factory behavior or guess public imports. Ordinary Model access and type annotations remain allowed. This is a performance guardrail, not a new type-safety guarantee.

## Final bounded community comparison

After correcting Service requirements for alternative root Blocks, an isolated placement lookup index from [PR #1756](https://github.com/foldkit/foldkit/pull/1756) was compared against local commit `3f043be3ea5ad92cc21306449981022044793376`. Both arms use the selected checked headers, including the same Service correction. This comparison uses a newer baseline than the canonical Schema import control above.

Three alternating pairs cover four workflows, with 24 fresh-process sessions. Source, compiler and semantic payload checks pass with unchanged memory and process limits. The candidate changes only the internal Binding lookup; it does not include that PR's direct-channel validation rewrite.

| Post-edit operation   | Current implementation | Placement index |
| --------------------- | ---------------------: | --------------: |
| Root completion       |                  169ms |           167ms |
| Root error appearance |                3,195ms |         3,080ms |
| Root error clearing   |                3,122ms |         3,077ms |
| ChangedUrl completion |                  252ms |           272ms |
| ChangedUrl hover      |                  272ms |           275ms |

The small diagnostic improvement does not justify the extra lookup machinery and repeatable regression in route completion. Retain the current distributive scan. Independent source review found no demonstrated semantic defect in the isolated index. The measurements and maintenance cost determine this decision; they establish no TypeScript limitation. The wider rewrite of channel validation remains unadopted because its edge cases need separate proof.

Concrete lookup parity, emitted/relocated policy consumers and unchanged compiler budgets pass. A proof for unresolved generic placement through policy resolution remains inconclusive. It establishes neither a guarantee nor a counterexample. No index code is integrated, and no further encoding search is needed for this closeout.

## Later bounded community experiments

The isolated named `ReplaceEffectsLayer` callable interface from PR #1764 is integrated locally. Against exact `7f4ccb76c0d5b55267b2e3d6c3be1c26e2c78da9`, three alternating pairs per workflow reduced root error appearance from 3,177.61ms to 2,925.48ms (-7.9%), error clearing from 3,156.59ms to 2,865.76ms (-9.2%) and cold diagnostics from 3,356.10ms to 3,078.10ms (-8.3%). Completion and route results show no reliable gain. The candidate names the existing inline callable type and leaves runtime code unchanged; it does not adopt `assembleAs`, generated contracts or Html variance. Source candidate evidence is in `/private/tmp/foldkit-named-layer-assessment-evidence/`, and measurement results are in `/private/tmp/foldkit-named-layer-measurement-results/status.json`.

Unannotated exported callables extracted from `replaceEffectsLayer` fail declaration emission in both controls. The original reports private handler-contract names; the named-interface candidate reports the private `ReplaceEffectsLayer` name. This experiment therefore does not make inferred extracted callables portable. A purposeful `typeof OriginalBlock.replaceEffectsLayer` annotation passes all six canonical/candidate source, emission and relocated-consumer checks. The commands, results and logs are under `/private/tmp/foldkit-model-export-comparison/integration-verification/named-callable-*`, with fixtures in `/private/tmp/foldkit-named-layer-assessment-evidence/extracted-callable-annotated-proof/`.

The finite handler-key grouping extracted from PR #1763 is rejected. Three alternating pairs found the target root diagnostics essentially flat, so the result does not justify another internal grouping path. Candidate and focused evidence are in `/private/tmp/foldkit-handler-group-assessment/assessment/`, `/private/tmp/foldkit-handler-group-measurement-results/status.json` and `/private/tmp/foldkit-handler-group-focused-emitted-evidence/status.json`.

The PR #1765 constructor workload is retained as a diagnostic benchmark. Across three cold pairs in fixed local-first order, its median was 353ms for local Message constructors and 2,687ms for completed-Block constructors. All full clean responses and 3GiB/27s guards pass. Fixed ordering leaves an order/cache limitation, and the benchmark characterizes remaining cost without fixing it or establishing a general cause. Evidence is in `/private/tmp/foldkit-message-constructor-evidence/status.json` and `/private/tmp/foldkit-message-constructor-evidence/round-{1,2,3}/report.json`; the reviewed harness is `/private/tmp/foldkit-message-constructor-assessment/assessment/profile.candidate.ts`.

Active ordinary guidance now names a single private zero-argument producer `assemble` and places its checked completed-Block export immediately after it. Descriptive producer names remain appropriate where a file has multiple producers, and historical or explicit bad/before examples remain unchanged. The naming cleanup changes no assembly payloads or checked headers beyond the producer identifier. Static audit and byte-level payload evidence are in `/private/tmp/foldkit-model-export-comparison/integration-verification/assembly-naming-cleanup-static-audit.json` and `/private/tmp/foldkit-model-export-comparison/integration-verification/assembly-naming-cleanup-payload-proof.json`.

The integrated patch passes core source and declaration builds, UI source/build and public declaration checks, all 34 example typechecks, Typing Game and Website typechecks, both materialized SSR/SSG scaffold checks, 22 standalone teaching entry points, and the script typecheck. Eight region-oriented teaching files are not standalone programs; their existing diagnostic-code sequence matches the frozen pre-naming control. The four focused source/emitted/relocated groups and unchanged compiler budgets pass, including the permanent extracted-callable handler and Service checks. Application lint reports no diagnostics across 1,195 files; the focused real-Oxlint regression accepts a producer named `checkedBoundaryProducer`, confirming name-independent recognition. The core's 276 emitted JavaScript files remain byte-identical to the isolated candidate and its verified baseline. Final integration records are under `/private/tmp/foldkit-model-export-comparison/integration-verification/` and `/private/tmp/foldkit-followup-focused-emitted-evidence/`.

These are bounded local outcomes. They do not promote a new Ready snapshot or change the separate release, security, package, deployment and consumer-upgrade gates.

## Verification links

- [Checked aliases and declaration support](../packages/foldkit/src/block/fromAssembly.ts)
- [Source/runtime and adversarial checks](../packages/foldkit/src/block/fromAssembly.test.ts)
- [Emitted acceptance and exact members](../packages/foldkit/declaration-tests/from-assembly.accepted.ts)
- [Producer overload rejection](../packages/foldkit/declaration-tests/from-assembly.overloaded-producer.ts)
- [Erased carrier rejection](../packages/foldkit/declaration-tests/from-assembly.carrier-guards.ts)
- [Generic Codec and payload checks](../packages/foldkit/declaration-tests/from-assembly.generic.ts)
- [Declaration harness and relocation](../packages/foldkit/scripts/check-emitted-declarations.ts)
- [Lint implementation and provenance](../packages/oxlint-plugin-foldkit/src/rules/no-completed-block-model-in-schema.ts)
- [Real lint acceptance/rejection fixtures](../packages/oxlint-plugin-foldkit/test/integration/real-oxlint.test.ts)
- [Active organization guidance](../packages/website/src/page/projectOrganization.md)
- [Feedback dispositions and release boundary](./preview-feedback-closeout.md)

This assessment records local implementation and verification. The published Ready snapshot, deployment, package versions and three migration paths remain unchanged. A replacement preview requires separate final approval and publication verification.
