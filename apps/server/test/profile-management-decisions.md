# Profile management BDD decisions

This log retains vetted decisions and records subsequent consolidation choices. Repository assertions and fixed name/table-count assumptions from the initial implementation are superseded.

## Validated decisions

- Implement only the three scenarios in “People can manage their profile”; leave the other People rules for subsequent work.
- Use service integration tests with the existing in-memory database, migrations, fixtures, and account-session builder. HTTP profile mutation handlers are currently stubs.
- Use the same `TestLayerWithServices` instance for background and scenario so they share a database within each scenario; each scenario builds its own layer scope.
- Interpret the feature’s plain-text bio as one paragraph in the existing versioned rich-text format; compare persisted text using the existing `tiptapToText` helper.
- Store nonempty plain-text bios as one rich-text paragraph; an empty bio clears it. Assert only supplied profile fields using the authorized service result.
- Add a root Vitest project for server `*-feature.test.ts` files and relevant service/session-builder tests so the new scenarios run in `quality-gates` without changing which unrelated server tests run there.
- Do not add the global BDD completeness checker to the gate while the remaining feature scenarios are unimplemented. Leave broader framework improvements and feature wording out of scope.
- Keep these fixed examples as BDD scenarios rather than randomizing their inputs; existing repository property tests cover broader generated persistence cases.
- Build the BDD Vitest project directly from the shared configuration and override its include list. Vitest merges inherited include arrays, so extending the server configuration also collected unrelated tests; that exploratory run was stopped and the configuration corrected.
- Add `ProfileService.findByHandle` and `findById`, returning `Option` for absence and applying `Policies.profiles.canRead` to each existing profile. Authorization failures remain typed failures rather than being converted to absence.
- Run the visibility/access matrix sequentially because the cases mutate and read the same profile; keep the separate impersonation isolation check concurrent.
- Keep impersonation scoped to each Effect with `withSession`, rather than a mutable global current user or another actor context. Load each account session from persisted access levels and memberships without exercising authentication transport.
- Decode background state, handles, and table input using existing Effect schemas. Keep the reusable handle setup local to this test file.
- For testing a duplicate handle, require `HandleTakenError`, preserve the complete original profile, and verify that the conflicting handle still belongs to the other person.
- Separate scenario layer-construction errors from step errors in `effect-bdd`'s configuration types: the existing shared error parameter rejects real service errors when a database layer is supplied. This is the minimal framework fix needed to type-check these scenarios, without casts or suppressions.
- Resolve names from a schema-validated scenario-local actor map. Do not assert a particular name or table row count. Unknown names fail lookup instead of silently acting as another person.
- Decode table rows using field-specific domain schemas. Apply only supplied fields, in table order; repeated fields take their last value. Support handle, name, bio, location, and visibility. Unsupported field names fail schema decoding rather than being ignored.
- Keep existing profile HTTP endpoints unchanged for this experiment; their current read handler already applies the same policy. The requested comparison is at the service boundary.
- Add service authorization checks for both read methods across PUBLIC/COMMUNITY visibility, every platform access level, visitors, and missing profiles. Include this service test in the root project alongside the consolidated profile feature test.
- Retain the meaningful duplicate-handle assertions: typed failure, unchanged original profile, and unchanged ownership of the conflicting handle, all read through the service.

## Validated session design

- Consolidate the feature scenarios in `profiles-feature.test.ts` using `withSession(action, yield* makeAccountSession({ personId }))` directly.
- Remove the actor-object, session-layer, and current-actor prototypes and the shared experimental runner.
- `makeAccountSession` is an Effect backed by the database; access levels and organization memberships cannot be supplied as overrides.
- `ProfileTable` validates supplied fields using domain schemas, and `profileUpdateFrom` applies only those fields. There is no requirement for four rows or four specific fields. Duplicate fields take their last value, as already vetted above.

## Validated account bootstrap

- Provision profile-feature actors through the existing production `provisionMagicLinkAccount` operation, then promote newcomers through `PeopleService` using a database-backed administrator session.
- Retain one trusted `seedPerson("ADMIN")` fixture per isolated scenario to establish the initial administrator. That is the only actor created outside production provisioning; authorization cannot grant the first administrator without a preexisting administrator.
- All profile preparation, actions, and assertions use `ProfileService`. Broader HTTP endpoint coverage remains outside this change.

## Correction to the listener notes

The previous Turso attribution was incorrect. The local HTTP listener belongs to `packages/migration/src/preview.test.ts`, which uses `NodeHttpServer.layerTest` to test migration previews. This does not indicate that the server application uses Turso. The quality gate required permission for that existing migration test's local listener; it was rerun without changing or skipping the test.

## Consolidation decisions made without consulting the user

- Reuse the production database-backed authorization session projection by exposing `resolveAccountSession` independently of `AuthenticationHttp.CurrentSession`. Both authenticated requests and test sessions use that same resolver; credential verification remains the authentication middleware's responsibility.
- Load a fresh session for each feature action/read so subsequent actions reflect persisted permission changes. A previously acquired session remains a snapshot.
- Reject missing people with the resolver's existing `UnauthorizedError` rather than inventing a session or silently assuming COMMUNITY access.
- Remove unused `makeAdminSession` and `makeModeratorSession` conveniences; they previously manufactured roles. Existing callers now await `makeAccountSession` with only a person ID.
- Preserve useful concurrent-session, nested-session, and unauthorized-edit checks for the chosen `withSession` design rather than retain duplicate checks for discarded designs.
- Verify role refresh through a real `PeopleService` promotion. Verify membership additions, edits, removals, and filtering using controlled organization fixtures in the session-builder contract test, where fixture repository calls test session projection rather than profile behavior.
- Run the changed comments/publications service tests and existing authentication HTTP test explicitly because the root project does not collect those server suites.

### Experiment validation (before consolidation)

- Before consolidation, all four designs passed their three profile scenarios and three impersonation contracts; both profile-read authorization tests passed. The four prototype files have now been removed.
- `pnpm run quality-gates`: formatting, workspace type checks, linting, and all 269 tests across 30 files passed.
- `git diff --check`: passed. No commits or git history changes were made.

## Account-bootstrap options discussed without implementation

- Call the existing production account-provisioning operation after treating identity verification as a satisfied prerequisite. `provisionMagicLinkAccount` creates the authentication subject, person, profile, and credential transactionally without email delivery or login transport. A shared provider-independent provisioning service could later serve both magic-link and OAuth flows.
- Exercise application HTTP endpoints in-process with a persisted authenticated identity. This would cover request schemas, routing, and service policies without credential verification; missing mutation handlers would first need implementation.
- Keep a small set of full authentication tests using the existing in-process HTTP and captured-email infrastructure to cover verification, cookies, and middleware. No external identity-provider or email-service requests are necessary for the existing magic-link test.

## Consolidated validation

- The consolidated feature scenarios, profile-read authorization, session-builder contracts, affected comments/publications suites, and existing authentication HTTP test passed: 16 tests across 6 files.
- `pnpm run quality-gates`: formatting, all workspace type checks, linting, and 253 tests across 28 files passed.
- `git diff --check`: passed. No commits or git history changes were made.

## Provisioning decisions made without consulting the user

- Apply production provisioning to every regular actor in `profiles-feature.test.ts`, including the anonymous conflicting-handle owner and the session-isolation checks. Leave lower-level repository and unrelated service fixtures unchanged.
- Keep the provisioning helpers local to the consolidated feature file until another feature needs them; do not introduce a new context or shared provisioning abstraction.
- Give each account a generated valid email at `example.com` so repeated display names do not accidentally reuse an account. Validate the returned authentication subject ID with `PersonId` rather than casting between domain brands.
- Use the provisioned profile name directly rather than issuing a redundant profile update during the background.
- Reuse the scenario's initial administrator when provisioning its additional actors; acquire a fresh persisted administrator session for each approval.
- Add a lifecycle check proving that production provisioning starts with NEWCOMER access, that community profiles are denied before approval, and that an approved person can read them with a newly resolved session.
- Do not refactor magic-link/OAuth production provisioning or run credential verification, email delivery, or login transport for these feature prerequisites.

## Provisioning validation

- `pnpm run quality-gates`: formatting, all workspace type checks, linting, and 252 tests across 27 files passed.
- `git diff --check`: passed. No commits or git history changes were made.
