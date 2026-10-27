# Wiki articles decisions

- Follow existing feature suites: real services, production account provisioning, isolated SQLite, and CRDT edits. Preserve pre-existing work and Git history.
- Surprise: wiki service is empty; repository creation is auto-approved. Add pending creation without public projections; approval publishes it atomically. Preserve trusted import creation.
- Resolve cultivar properties at read time; Unknown stays Unknown, Inherit reads the current published parent, Value overrides it. Validate parent kind/status on creation and approval.
- Bookmarks use the existing composite key and explicit upsert/removal; INDIFFERENT remains stored.
- Persist main-photo selection separately with a composite foreign key to an article attachment. Filter censored selections on reads.
- Surprise: card names used the CRDT object schema, while translation projections store strings. Align card names with the page projection.
- Page reads now include cultivar entries/resolved attributes; card reads include the selected thumbnail and filter unpublished articles/censored media.
- Keep enrichment submission after the outer approval transaction commits. Media selections through creation/revision payloads remain deferred and explicitly rejected; direct photo attachments use the media permission/ownership guard.
- Added 30-run bookmark access/state/isolation and 20-run cultivar range/state properties, plus rejected creation, parent validation, attachment ownership, main-photo replacement/censorship regressions.
- Atlas regenerated the initial migration. First full gates passed format/types/lint and 391 tests; one existing migration-preview test needs a local HTTP listener denied by the sandbox. Rerun with listener access.
- Final review: include localized cultivar names in page entries; assert displayed names as well as IDs.
- Categorized photo attachments now persist category metadata and are checked through the article gallery. The wiki HTTP group delegates to the service, including moderator-only main media selection.
- Pending creation returns an article ID; evaluation uses `/wiki/revisions/:revisionId` because pending articles have no published handle. Preserve evaluation reasons in the service.
- Validation: `pnpm run quality-gates` passed (394 tests, 5 unrelated TODOs); the API registration smoke test passed separately. The wiki suite has 25 passing tests and no TODOs.
- Bookmarks are set and removed through `PUT`/`DELETE /wiki/:kind/:handle/bookmark` with an explicit state; the stateless toggle couldn't express the planting states the article page offers.
- Article pages list bookmarkers and contributors (approved revisions per author). Both include only public, active profiles, like profile search, so anonymous readers see the same list; INDIFFERENT bookmarks are omitted.
- Wiki cards carry plant scientific names, and publication cards carry their best-matching translation, owner, media and CONCEPT articles, so search and article pages render without per-card requests.
