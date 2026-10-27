---
'@foldkit/oxlint-plugin': minor
---

Recognize completed Block Bindings in the architecture rules. `no-direct-block-state-update` tracks a parent Model passed to a Binding’s `fold` or a Step composed through `Update.combineSteps`, including copied child operation and update Models that would discard Commands or an OutMessage. The Command naming and Mount element checks recognize named Block definition methods. Development guard checks recognize `Program.make` and `Program.makeElement`. OutMessage forwarding and Message wrapper checks recognize Binding configuration. Diagnostics point to registered Binding operations.

For wrapped keyed Bindings, `no-direct-block-state-update` rejects parent replacement of the nested child Model while allowing the parent to update wrapper metadata and collection membership.

Recognize provenance-backed child transform references in direct field evolution, keyed `Array.map` calls, and Definition-owned `makeFieldsStep` records. Imported aliases remain tied to their registered child module, and local helpers require child Model annotations, so ordinary domain transforms, parent collection reconciliation, Binding writers, and initialization stay valid.

Recognize root-owned Messages in Application completion callbacks and view helpers whose builder type comes from the owning Composition without permitting parents to manufacture foreign child Messages. Report authored `Got*` wrappers around Block, Query, and UI component Messages; registered Bindings generate and route those delivery envelopes.

Recognize a feature's own Messages imported from an early `definition.ts` inside owned authoring callbacks and completion configuration. Views and helpers can import their Composition or owner-specific ViewBuilder alias, such as `SearchViewBuilder`, from the owning `composition.ts` or explicit `composition/index.ts` barrel. External consumers do not import `composition/composition.ts`; internal implementation modules may use direct relative sibling imports to avoid barrel cycles. Relative imports from the feature's view, update, and composition directories resolve against that same feature's Definition. Foreign child aliases and paths into another feature retain their diagnostics.

Trace locally named Compositions back to their exact Definition when recognizing owned view callbacks, including `makeView.withInputs`. Both ordinary `Block.makeDefinition(id, contracts)` and specialized `Namespace.makeDefinition(contracts)` preserve their own Message allowance; foreign child Messages retain their diagnostics.

Consolidate the Command declaration checks under `command-define-pascal-const` and child state ownership checks under `no-direct-block-state-update`. Explicit configurations must replace `foldkit/command-binding-matches-name` with `foldkit/command-define-pascal-const` and `foldkit/require-fold-for-child-update-result` with `foldkit/no-direct-block-state-update`.

Recognize owner-specific `ViewBuilderFor` aliases imported from Composition modules in every HTML builder rule, including extracted helpers and `makeView.withInputs`, without treating unrelated `*ViewBuilder` types as Foldkit builders. Generated keyed delivery carries the Binding key; application-authored wrapper payloads remain rejected.
