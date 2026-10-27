# People and organizations test review

## 2026-10-07 — Initial findings and decisions

- Preserve pre-existing untracked files, including `profile-management-decisions.md`; this is a separate log for the current request.
- Move the three concurrent, nested, and unauthorized-profile-edit impersonation contracts into `impersonation.test.ts`. Add its explicit path to the root Vitest project so the split does not silently drop coverage.
- Keep provisioning/approval and last-administrator checks with the people feature: they exercise people behavior rather than session scoping.
- Use the shared access-level verification helper for both quoted access-level assertions and community/blocked assertions. Remove a redundant ADMIN-to-ADMIN assignment in the administrator invariant test: the bootstrap fixture is already an administrator.
- Replace the nested-session scalar `toMatchObject` assertion with an account-session shape assertion, checking both session type and person ID.
- Read the vendored Effect v4 implementation of `yieldNow`, `flip`, and `provide` before changing Effect-based tests.
- The organization repository and authorization policies exist, but every organization HTTP handler is a defecting stub and there is no organization service. Invitation acceptance is absent from the API, and no invitation repository operations exist (the SQL schema already has an `organization_invitations` table). Asked the user whether to implement missing behavior or leave unsupported scenarios explicitly failing; do not disguise fixture writes or policy-only assertions as working organization behavior.

## People review

- Existing BDD coverage tests persisted state, fresh database-backed sessions, denied mutations remaining unchanged, duplicate-handle ownership, account-deletion confirmations, retained publications, and wiki-history anonymization. Preserve those meaningful assertions.
- Background and scenario use the same layer instance within a scenario; rebuilding independently would lose the seeded data. Keep the existing layer-scoping approach.
- Regular actors use production account provisioning and approval; only the initial administrator is a trusted fixture. Keep this prerequisite separate from authentication transport.
- Fixed feature tables are specification examples. Existing repository property tests cover generated persistence inputs; randomizing these BDD scenarios would obscure the requested specification.

## Follow-up surprises

- Correction to the initial invitation finding: `schema.sql` already defines `organization_invitations` with inviter ID, invitee email, role, status, and creation/update timestamps. The missing piece is application operations, not the database table.
- The EDITOR permission set currently grants `organization:edit-profile`, directly contradicting the organizations feature rule that only MANAGER can edit the organization profile. Keep this visible as a real mismatch rather than changing the feature to fit the implementation.
- The last-manager scenario expects generic “access is denied,” but the domain already defines `LastManagerCannotLeaveError`; use the specific invariant failure if implementing that behavior, and document this distinction.
- People coverage check passed: 75 steps across one feature. The focused people/impersonation run passed: 27 tests across two files.
- `check-bdd` requires a local tsx IPC socket; its first sandboxed invocation failed with EPERM, then the same checker succeeded with execution permission.

## Validation so far

- `pnpm run quality-gates`: all formatting, workspace type checks, lint, and 272 tests across 28 files passed. The first sandboxed run passed 271 tests but failed the existing migration preview test because its HTTP listener was denied (EPERM); rerunning with execution permission passed without skipping or changing that test.
- `git diff --check`: passed.
- At this checkpoint, organization implementation was pending the user's answer; the subsequent authorization and implementation are recorded below. No unsupported scenario was registered as passing or covered by a placeholder.

- Initial organization `check-bdd` run reports 65 steps, with 48 undefined. Its default search globally matches common steps such as “access is denied” from the people test and “the following people exist” from wiki tests. Those matches do not establish organization scenario coverage. Use `--test-pattern` to restrict completeness checks to the corresponding feature test file, in addition to running the actual suite.

- File-scoped people check also passed: all 75 steps matched within `people-feature.test.ts`, with zero undefined steps.

## User decisions and organization implementation

- User authorized supplying missing application behavior and made `.feature` permissions canonical. Remove EDITOR's profile-edit permission from the shared permission map so both organization and profile services enforce MANAGER-only edits.
- Add a real organization service over existing repositories, using transactional writes and the existing SQL schema. Keep the tests at the service boundary, matching the people suite; HTTP wiring remains a separate concern alongside the existing people/publication stubs.
- New organizations default to PUBLIC profile/member visibility, and the creator becomes MANAGER in the same transaction.
- Invitations use the existing invitee-email schema and PENDING/ACCEPTED statuses. Acceptance looks up the authenticated person's persisted email and rechecks community access. Creating an invitation must not create a membership.
- Reject duplicate invitations and existing memberships rather than silently replacing an invitation or role. No expiry behavior is invented: the schema has an EXPIRED status but no expiry timestamp or feature requirement.
- Preserve at least one MANAGER for leave, removal, and role demotion. The feature's generic denial step accepts the existing specific LastManagerCannotLeaveError for this invariant and UnauthorizedError for permission failures.
- Delete the organization's owning profile so its memberships, invitations, and content cascade along with the organization, matching the account-deletion implementation.

## Organization coverage and review refinements

- All 21 organization feature scenarios passed in the first runtime run. The file-scoped checker initially missed 10 steps because it only recognizes literal step patterns. Replace dynamic pattern/keyword helpers with literal `Given`/`And`/`Then` registrations sharing typed handlers. The scoped checker now reports all 65 organization steps covered, zero undefined.
- Organization backgrounds create organizations, invite actors, accept invitations, and have the bootstrap manager leave through production services. They do not simulate application behavior by writing membership fixtures.
- Permission-denied scenarios compare complete organization, profile, membership, and invitation state before/after the action. Visibility scenarios verify exact member lists for allowed readers and typed authorization failures for denied readers.
- Verify editor denial through both OrganizationsService and ProfileService, including unchanged persisted state. Add a schema-generated property test across organization roles and platform access levels for both mutation boundaries.
- Add invariant checks for last-manager removal and demotion to every non-manager role, and invitation checks for wrong-person acceptance, access revoked before acceptance, and repeat acceptance.
- Normalize the previously unused LastManagerCannotLeaveError payload to `organizationId`, matching the project's TypeScript naming convention. SQL columns remain snake_case.
- The user staged some in-progress files during this work. Preserve the index and continue editing the working tree; do not stage, unstage, commit, or change history.

## Reachable access states

- The expanded property test exposed a setup constraint: PeopleService intentionally rejects reverting an approved person to NEWCOMER. A newcomer also cannot be invited in the first place. Generate existing-member states across trusted levels and BLOCKED; test NEWCOMER invitation rejection through the feature scenario rather than manufacturing an unreachable membership state.
- Revoking an invitee's access uses the supported COMMUNITY-to-BLOCKED transition. Acceptance fails without consuming the invitation, then succeeds after community access is restored.
- Compare visibility responses against persisted membership rows, avoiding a baseline derived from the same service response being tested.

## Final validation

- `pnpm run quality-gates`: formatting, all workspace type checks, lint, and all 296 tests across 29 files passed. The organization test file includes 21 feature scenarios and three additional security/invariant checks, including the 30-run schema-generated property test.
- File-scoped `check-bdd`: People 75/75 steps; Organizations 65/65 steps. Both checks passed with zero undefined steps. Checks are deliberately scoped to their corresponding test files to avoid unrelated matching steps disguising coverage gaps.
- `git diff --check HEAD`: passed. No git history or staging changes were made by this agent.
- No schema migration was needed. Organization HTTP handlers remain existing stubs; the requested BDD behavior is implemented and tested through the application service boundary.

## Invitation expiration and focused assertions

- User requested a two-week invitation lifetime, then selected `DateTime.add` over Duration. Compute the deadline with `DateTime.add(invitation.createdAt, { weeks: 2 })`; timestamps are UTC, and acceptance at the deadline is expired.
- Reuse `createdAt` rather than add an expiry column or migration. Reject expired acceptance with OrganizationInvitationExpiredError. Lazily persist EXPIRED on an attempted acceptance; return the error as a Result value inside the transaction, then fail outside it so the status update commits instead of rolling back.
- Permit managers to renew expired invitations, including pending rows whose computed deadline passed without an acceptance attempt. Reuse the unique organization/email row and reset creation time, update time, inviter, role, and PENDING status. Preserve duplicate-invitation denial while an invitation is active, and preserve accepted membership roles.
- Add feature examples for one millisecond before, exactly at, and one millisecond after the two-week deadline. Use Effect TestClock to move time without sleeping. Also test renewal both before and after the lazy EXPIRED transition, and acceptance against the renewed deadline.
- Replace global `readState` and all four redeclared SQL queries with targeted repository reads. Creation checks only the requested handle; profile edits check the affected profile; role changes check the target membership; invitation operations check the relevant organization's invitation collection or the specific invitee's invitation/membership. Deletion checks the selected organization and its dependencies. These assertions avoid coupling to unrelated people and organizations while retaining persistence checks for denied mutations.
- Add a repository `listInvitations(organizationId)` operation for collection assertions instead of redefining persistence SQL in the feature tests.
- The expiry outline exposed two BDD framework issues: ScenarioOutline coupled step errors to layer errors, and the checker structurally normalized every parameter even when an outline used fixed quoted values alongside numeric examples. Align ScenarioOutline's type parameters with Scenario and match each real substituted example. Add a checker regression for valid numeric examples, invalid examples, and missing examples.

## Expiration validation

- Focused organization suite: all 28 tests passed, including the three deadline examples and renewal paths.
- File-scoped `check-bdd`: all 68 organization steps covered, zero undefined.
- `pnpm run quality-gates`: formatting, all workspace type checks, lint, and 301 tests across 30 files passed on the final run.
- One earlier full run failed the unrelated `localized-crdt.test.ts` property assertion with `AZA` versus `AAZ`; the unchanged test passed on the full rerun. No CRDT implementation or test changes were made for this task.
- `git diff --check HEAD`: passed. No git staging or history changes were made by this agent.
