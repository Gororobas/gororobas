# Publications implementation decisions

## 2026-10-07 — Initial findings

- Follow the people/organization suites: exercise application services with isolated databases, production account provisioning, and production organization invitations/acceptance. Preserve pre-existing untracked files and Git history/index.
- Read vendored Effect v4's `flip` and layer-provision signatures before extending the Effect-based tests.
- PUBLIC personal publications currently bypass the author's NEWCOMER state. Resolve the owner's current access level for reads, so approval changes visibility without rewriting existing posts. Apply the same gate to comment creation and attribution reads.
- Comment censorship currently checks authorization without changing data. Persist moderation status in both the authoritative comment aggregate and its projection, transactionally; existing edits must retain censorship.
- MODERATOR lacks `comments:censor` despite the feature explicitly granting it. Add that permission to the shared permission map.
- Attribution currently requires membership even for PUBLIC organization member visibility. Reuse the organization member-visibility policy for contributors/history, after checking publication visibility. Keep the existing service contract of denying access to identity-bearing results when identities are private; PUBLIC publication pages remain readable.
- Use real CRDT client edits and replay persisted commit updates to verify historical content and authors. Advance the test clock between edits rather than assume timestamps differ under TestClock.
- Existing HTTP handlers are stubs. This task implements and validates service behavior, consistent with the referenced suites; no schema migration is needed.

## Coverage and verification findings

- Implemented all 19 ordinary scenarios and all 18 attribution-outline examples. A file-scoped BDD check reports 100/100 steps implemented; matching is restricted to `publications-feature.test.ts` so unrelated handlers cannot mask omissions.
- Denied publication edits/deletions compare the persisted projection, snapshot, localized page, and commits; successful deletion verifies all four disappear. Historical assertions replay real persisted CRDT commits and compare each author and content version.
- Added a 40-run schema-generated property test across post/event kind, PUBLIC/COMMUNITY visibility, and all viewer access levels. Check pages, history, contributors, comment listings, and comment creation before/after author approval using freshly resolved sessions. Denied comment creation must preserve persisted comments.
- Added a censorship regression covering both aggregate/projection status, subsequent author CRDT edits, repeated censorship by an admin, and a visitor's filtered comment listing.
- Comment listings previously exposed all rows without checking publication visibility. They now reuse the publication visibility guard and omit CENSORED comments; repository reads remain available for internal moderation/state assertions.
- Backgrounds list organizations before people, unlike the organization feature. Bootstrap that organization through a separate administrator, invite/accept each specified member, then have the bootstrap creator leave.
- The initial quality run passed formatting/types/lint and 338 tests; two migration-preview tests needed local HTTP listeners blocked by the sandbox. Reran with listeners allowed.
- The full run then exposed a stale domain property test: its title says moderators and admins can censor, but its predicate denied moderators and never required admins to succeed. Corrected it to require exactly the two specified access levels.
- Existing comment/publication service and comment repository regression suites also passed (9 tests across 3 files); these are outside the root quality-gate Vitest project's include list.

## Final validation

- `pnpm run quality-gates` passed: formatting, all workspace type checks, lint, and 340 tests across 31 files.
- Publication suite: 39 tests passed (37 feature cases plus the access-matrix property test and censorship persistence regression).
- File-scoped BDD check: 100/100 publication steps implemented, zero undefined steps.
- Focused existing service/repository regressions: 9/9 tests passed.
- `git diff --check` passed. No Git staging, commits, or history changes were made.
