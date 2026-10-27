# Media implementation decisions

## Uploads and attachments

- Uploads only create `media_assets` and processed files. They accept no publication or wiki target. Publication create/update and wiki create/revision payloads select the previously uploaded assets. Internal attachment helpers use `publication_media_assets` and `wiki_article_media_assets`; one upload can be reused in several places. There are no attachment HTTP endpoints.
- Only the uploader can attach a new asset or edit its descriptions. Authorized target editors can retain existing attachments uploaded by other people. Publication create/update and wiki creation run content, history, projections, descriptions, and relationships in one outer SQL transaction; nested Effect SQL transactions use savepoints. Failures retain the independent upload and roll back all target changes.
- Publication `mediaIds` and wiki `mediaAssets` are complete selections: omission preserves relationships; an empty array removes them. Wiki revisions persist their optional selection and apply it only when approved, in the same transaction as the content update and evaluation. Rejected/pending revisions never publish their new media or descriptions.
- Target read responses include their uncensored assets. Publication and wiki services own their listing methods and queries.
- Unattached media is visible to its uploader and moderators/admins. This prevents a private publication's media from being publicly accessible between upload and attachment. Wiki attachments are public; publication attachments grant access when the viewer can read at least one attached publication. Deleting an attachment or publication does not delete the reusable asset.
- Reads check current publication visibility and owner access, so newcomer promotion takes effect without changing the asset. Censorship takes precedence over all attachment audiences. Unauthorized delivery returns `MediaNotFoundError` for originals, derivatives, HEAD, and range requests.

## Wiki media schema

- `wiki_article_media_assets` replaces both photo tables and explicitly refers to app-managed uploads via its foreign key to `media_assets`. External workflow media remains in `wiki_article_external_media`.
- Category and localized descriptions belong to `media_assets`, shared across every relationship. `wiki_article_media_assets` contains only the two foreign keys. `descriptions` is a JSON map of supported locales to rich text documents; entries are optional. Changing the asset description updates its presentation on every attached article.
- The follow-up migration consolidates the earlier association metadata onto assets. It preserves each locale independently; conflicting values use the latest association timestamp, breaking ties by article ID. Category uses the latest association.
- There is no editorial `order_index`. Listings use asset IDs for deterministic results until another ordering strategy is chosen.
- Moderation belongs to the media asset once, so censoring hides it everywhere. The former wiki metadata table's redundant status is removed.
- Atlas generated the structural migration. Data-transfer statements preserve publication links and wiki metadata before tables are rebuilt. Existing unlocalized descriptions are placed under `pt`, reflecting the app's original language; the legacy schema contains no language information to infer another locale. Existing metadata censorship is transferred to the asset.

## Moderation

- Every remaining `moderation_status` column is `NOT NULL`, including both canonical comments and their projections. Creation assigns `APPROVED_BY_DEFAULT` explicitly. The earlier migration converts existing nulls to that value; the latest schema requires writers to supply the status rather than relying on SQL moderation defaults.
- `REAPPROVED_AFTER_CENSORING` records reversal. A single `moderate` operation accepts `CENSORED` or `REAPPROVED_AFTER_CENSORING`, guarded by `media:moderate`. Reapproving an uncensored asset leaves its status unchanged. Description and attachment rows survive moderation. All media visibility and ownership policies live in the domain media policies module.
- Moderators and admins have media moderation permission. The existing policy property test asserts that both moderators and admins are allowed, and other roles are denied; its former admin branch didn't assert successful authorization.

## Authentication

- History shows the migration to `@yielded/auth` applied `AuthenticationHttp.RequireSession` to the entire application API. That called the library's strict `requireSession()` before application policies could decide whether visitors were allowed.
- `OptionalSessionLive` and its nullable authentication contract are removed. One `ApiAuthentication` boundary resolves every application's API request with the native `AppAuth.getSession()` and provides the resulting `SessionContext` to handlers. Missing/invalid credentials or a verified subject with no person resolve to visitors; policies decide access. Availability failures remain failures.
- Request credentials and roles are resolved inside the middleware callback, never cached when building the layer. The native auth HTTP boundary must install `AuthRequest`; missing infrastructure is a defect, not anonymous access. The API middleware captures only shared auth/SQL services.
- The required-session contract remains available for explicitly protected authentication flows and its isolated authentication integration test. It is not applied to application endpoints.

## Tests and other improvements

- All 14 media feature scenarios use real uploads, processing, persisted attachments, and service delivery checks.
- Additional regressions cover owner authorization, attachment rollback retaining uploads, shared localized descriptions, censorship reversal, reuse across publications, visibility after deleting an attachment's publication, whole-target transaction rollback, and revision approval/rejection.
- HTTP tests cover visitor/public access, policies denying uploads, private GET/HEAD/range denial, and verified sessions whose person no longer exists. Authentication's real signup/signin/signout integration test also runs.
- A migration regression seeds the previous schema and verifies preserved links, localized legacy descriptions, transferred censorship, comment defaults, NOT NULL enforcement, and foreign-key integrity.
- Account-deletion scenarios now assert that a deleted person's verified session resolves to a visitor instead of an authentication error.
- The quality gates exposed an ambiguous CRDT property-test input: generated text could contain its prepend/append markers, allowing the text diff to choose different insertion positions. That test now generates text without those markers while retaining its Unicode and convergence checks.
- BDD background configuration now allows layer setup errors and step errors to differ, consistent with scenario configuration. This permits temporary filesystem setup without error suppression.
- Publication HTTP mutation handlers were stubs and the wiki API group was not registered. These create/update/revision paths now call the target services. The wiki external-data workflow runs after the outer transaction commits; failed attachments never submit enrichment. Unrelated publication search/history and wiki search/bookmark implementation remain outside this change.
- `CommentRow` reuses the non-snapshot fields of `CommentCrdtRow`; `CommentData` reuses `CommentRow.fields`.
- Offline uploads remain deferred. The current API assumes that selected IDs have already reached server storage. Supporting local pending assets will need upload state and synchronization/reconciliation semantics; no speculative `upload_status` column or workaround is introduced.
- The root Vitest configuration excludes older media HTTP, processing, persistence, and migration regression tests. Run them separately with `--config apps/server/vitest.config.ts`.

## Validation

- `pnpm run quality-gates` passed formatting, type checks, lint, and all 363 tests across 32 files.
- The supplemental server runs passed all 7 tests across 6 files covering media HTTP, processing, persistence, migration, anonymous API access, and real authentication flows.

## 2026-10-18 feature coverage follow-up

- Bound the nine missing wiki-media scenarios to real uploads, `WikiArticlesService` attachments/pages, and media metadata/original/derivative delivery. All 14 media feature scenarios now execute; no production behavior gap surfaced.
- Denied attachments use the caller's own upload when permitted (including newcomers); blocked people and visitors use a fixture upload to reach attachment authorization. Assert that denied actions preserve stored assets, files, and attachments.
- Replaced the remaining rollback TODO with a trigger that fails the second attachment inside an outer transaction. Both attachments roll back while the independent upload stays private and readable by its owner.
- Fixed static BDD discovery to expand same-file step factories, keyword/pattern parameters, destructured defaults, boolean branches, named `steps` callbacks, and literal scenario tables. Expanded steps inherit the calling scenario's scope; unused factories, unresolved values, and recursive calls cannot manufacture coverage.
- Discovery regression checks real temporary TypeScript files, verifies that their code is never executed, and confirms a step bound only in one scenario cannot satisfy another scenario.
- Final validation: `pnpm run check-bdd` recognizes all 505 steps across seven features. `pnpm run quality-gates` passes formatting, every workspace type-check, lint, and all 477 tests across 46 files, with no remaining TODOs in the configured suite. The focused media/discovery run passes 23 tests.
