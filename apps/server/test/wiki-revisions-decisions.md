# Wiki revisions decisions

- Replace the pass-through `wiki-revisions.test.ts` with a feature suite using real services, account provisioning, isolated SQLite, and Loro rich-text updates. Cover every scenario/example in the feature.
- Surprise: proposal and evaluation already exist; complete/filtered revision history does not. Add a SqlSchema query through repository/service, ordered by creation time and insertion order when timestamps tie.
- Rejected creation has no public projection but keeps its revision; test public cards, visitor page/ID access, and retained history separately. Denied proposals must leave no revisions behind.
- User chose field-specific translation commands over a whole-translation upsert. Added translation lifecycle, content, common-name list, and grammatical-gender commands to WikiArticleEdit; kind-specific fields keep their existing commands. Revision tests now use these commands.
- Convergence must approve identical operations, not independently generated equivalent edits. Copy the persisted snapshot and revision updates into a second fixture; approve in reverse order and compare CRDT and public projections.
- Audit history checks editor/evaluator/status/timestamps and reconstructs each change from its update; rejected changes never enter the accepted reconstruction.
- The invoked grill-me skill requires a Skill tool with `grilling`; neither is available in this session. Continued the authorized implementation without that interview.
- Added a 20-run Schema/Arbitrary property for concurrent rich-text updates, checking both approval orders against an independent merge and article-scoped history filters.
- Validation: 28 wiki tests pass (27 feature examples plus the property); full suite passes 422 tests with 5 existing TODOs. Formatting, workspace type-checks, changed-file lint, and diff whitespace checks pass. `pnpm run quality-gates` stops at unrelated `.agents/skills/traits` lint errors and its missing `../tsconfig.base.json`; ran the full test stage separately.

- Reject duplicate translation additions, missing translation edits, and deletion of the last common name. Preserve list/rich-text container identities and unrelated languages/kind-specific fields during edits.
- Surprise: Loro re-ensuring a deleted mergeable map resurrects its preserved state. Clear old fields/names on translation re-addition; regression covers old content, gender, names, and plant origin.
- That regression exposed a rich-text attribute cleanup bug: `in` treated inherited keys such as `__proto__` as supplied attributes. Use Effect Record.has to check own keys so absent attributes are actually removed.
- Added a 30-run property for translation field edits across generated article kinds/languages, plus lifecycle and invalid-edit regressions.
- Invalid common-name move indices fail without mutation; malformed wiki edit payloads now fail instead of silently succeeding when no operation matches.
- Final translation validation: `pnpm run quality-gates` passes formatting, all workspace type-checks, lint, and 426 tests (5 pre-existing TODOs). Domain translation coverage includes 30 generated cases; server convergence coverage retains its 20 generated cases.

## 2026-10-18 follow-up

- Existing runtime bindings already cover all 27 feature examples plus the 20-run convergence property; retained them and strengthened missing assertions.
- Pending translation additions must fall back to Portuguese; pending translation edits must keep the previous Spanish content. Added these expectations to the feature itself.
- Every successful edit proposal now checks pending evaluation metadata and an unchanged accepted CRDT row. Denied edits must preserve the complete history and CRDT row.
- History expectations now use the requested evaluation filter instead of inferring APPROVED from the result count.
- No production behavior gap surfaced. The static BDD checker reports false missing bindings for helper-generated steps (its discovery reads literal Given/When/Then calls only); runtime feature execution passes all 28 tests.
- First full quality run passed format/type-check/lint and 465 tests, with 5 existing TODOs; the unrelated `PublicationTranslationRow` round-trip property failed. Its isolated rerun passed, so reran quality gates to distinguish a transient failure from a repeatable blocker.
- Final `pnpm run quality-gates` passes: formatting, all workspace type-checks, lint, and 466 tests (5 existing TODOs). The earlier round-trip property failure remains a flakiness concern outside this change.
