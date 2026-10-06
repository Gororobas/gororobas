# Yielded authentication decisions

Reference packages: `@yielded/auth` and `@yielded/auth-persistence` pinned to `0.1.0-beta.18`, matching `repos/auth`.

## User decisions

- There are no existing app accounts to preserve. Backwards compatibility with Better Auth cookies, sessions, verification records, and OAuth data is unnecessary.
- Delete the previous SQL/Effect migrations and regenerate the initial migration with Atlas.
- Implement application-owned signup through magic links; numeric codes are not an allowed authentication method.
- Prefer custom storage if straightforward. Otherwise the supported adapters are acceptable. Keep physical database names in snake_case. The follow-up uses authSubjectId/auth_subject_id for application subject references.
- Use Mailpit locally. Resend will be the eventual production delivery provider.
- Leave a runnable vertical-slice test proving signup and existing-account sign-in.

## Decisions made without consultation

- Reuse Yielded's durable SQL adapter rather than implement custom storage. Its proof port requires atomic rate budgets, conditional delivery claims, proof/continuation consumption, retry receipts, and cleanup; implementing all of those correctly is a substantial security subsystem.
- Map adapter tables/columns into the app's snake_case schema. Every physical subject reference is `auth_subject_id`. Use `auth_subjects` for application accounts and keep `people` and `profiles`; subjects include `active` and `security_revision`. Replace the Better Auth auth tables with the adapter's 14 auth tables, preserving the unrelated application schema.
- The composed adapter does not support `Email.makeLink` or arbitrary strategies. Use a separate storage-only `Auth` descriptor selecting its supported email-address persistence ports; never build its auth service or publish its operations. This includes two currently unused email-address tables and an unused identifier table. Keeping those tables enables adapter catalog validation without copying private query implementations or adopting Drizzle. Revisit when Yielded supports composing sign-in-only proof storage directly.
- Implement one public magic-link method over Yielded's `Proofs`, `Operations`, and `Sessions` primitives. All mailboxes can request the same flow without an account existence lookup. Resolve/create the account only after the one-time continuation is consumed. Store generic account credential revisions for session invalidation; do not populate the identifier table, since these proofs bind mailbox possession independently of account existence.
- Bind the flow ID, private request-binding verifier, normalized email, and name into the proof context digest. Neither verification nor completion may substitute a different identity or signup name.
- A new mailbox creates account/profile/person rows in one SQL transaction, with UUIDv7 ID, a generated `person-<id>` handle, PUBLIC profile visibility, and NEWCOMER access, matching `test/people.feature`. A returning account retains its name/profile/role. Imported accounts can acquire their first auth credential after mailbox proof; inactive credentials are never reactivated by this path.
- Use Yielded's documented standalone completion semantics: the continuation commits before provisioning/session establishment. A downstream failure burns the proof and requires a fresh request. Provisioning itself rolls back together, so no partial account/profile/person records survive. No cross-transaction atomicity is claimed.
- Use the default proof policy: five-minute magic links, thirty-second continuations, delivery limit one, failed-attempt/issuance budgets, and resend cooldown. Sessions have thirty-day absolute lifetime, seven-day idle lifetime, immediate SQL-backed revocation, and no positive authentication cache. Roles and memberships continue to resolve from the database on protected requests.
- Request binding requires an independently generated `AUTH_BINDING_KEY`; there is no development secret fallback. Token proofs do not need a proof signing key. `Proofs.make` currently widens the token policy in its public types, so its typed fallback ProofKeys service receives independent ephemeral random material; token mode never reads it.
- Cookies are Secure, HttpOnly, SameSite=Lax, and use the `__Host-gororobas-` prefix. Shared API cookie metadata uses `__Host-gororobas-session`. Mutations require the configured Origin and `x-effect-auth-csrf: 1`. No bearer/session tokens appear in auth result JSON.
- Use same-origin `https://localhost:4443` by default, with a Caddy local TLS proxy to the HTTP listener on port 4000. `AUTH_ORIGIN` configures the deployed origin and the application's CORS allowlist. Yielded rejects HTTP magic-link landing URLs; retain that protection locally.
- Serve a small first-party login/confirmation page at `/api/auth/login`. Strip the email secret fragment immediately, wait for an explicit confirmation click, and send only CSRF-protected POSTs to verify and complete. An email scanner's GET does not consume the proof.
- Keep the originating flow's non-secret email/name/reference in localStorage for five minutes so links opened in a new tab in the same browser work. Only one pending flow per browser is supported because a new begin replaces its request-binding cookie. Opening in a different browser requires a fresh flow; no cross-device proof forwarding is implemented.
- Use Mailpit's HTTP send API via Effect HttpClient, with scoped responses, no redirects/retries, a ten-second timeout, and typed definite-versus-uncertain acceptance errors. Keep mail bodies/URLs out of telemetry. The existing Yielded EmailDelivery port is the future seam for Resend; no production Resend implementation has been added.
- Remove Better Auth dependencies from both server and migration packages and the workspace catalog. pnpm added exact-version release-age exceptions for the three pinned Yielded packages; no broad package-family exception was introduced.
- Remove the unused Better Auth ID/schema exports and update the media HTTP test's session fixture. That test now shares one managed SQL runtime between setup and HTTP handlers, preventing two concurrent initial migrations from locking its SQLite database.
- Auth dispatch is scoped to the server process. Yielded's scheduler has no durable outbox; a process crash can lose queued email work, and an exact request retry does not authorize a second send. Retention cleanup is not scheduled yet; expired proof/budget rows remain until bounded cleanup is invoked. Do not assume expiration physically deletes records.

## Main server blocker raised for consultation

Checking the custom main runtime with a fully typed program revealed pre-existing missing API wiring: `GororobasApi` declares a wiki HTTP group without an implementation, and some handlers lack request-time service composition. The runtime's existing cast hides those requirements. Asked whether to expand this task to wire that API or keep it focused on auth. A separate, fully typed `main-auth.ts` entry point runs the complete auth surface locally without those unrelated API/workflow requirements. The existing main entry point also selects Yielded now, but its prior API wiring blockers remain until addressed.

## Verification

`src/authentication/authentication.test.ts` exercises real HTTP contracts, Secure/HttpOnly cookie delivery, the real SQL persistence adapter, and a fresh database built from the regenerated initial migration. It verifies email delivery, retry suppression, no account creation on landing GET, request/identity binding, signup persistence, protected middleware and database role resolution, sign-out/revocation, existing-account sign-in without duplicates/name changes, proof/completion replay rejection, proof/continuation expiry, inactive-account rejection, and provisioning rollback.

Run `pnpm exec vitest run packages/server/src/authentication/authentication.test.ts` from the workspace root, then `pnpm run quality-gates`.

The full quality gates passed: type checking, lint, and 234 passing tests (11 skipped). A separate live smoke check launched `main-auth.ts` with a temporary database, exercised real HTTP signup through session establishment, and verified the Mailpit transport's outgoing payload against a local HTTP capture server. Docker was unavailable, so the actual Mailpit/Caddy containers were not run.

## OAuth and middleware update

- Protected APIs use Yielded's SessionContract and HTTP security layer directly. The authorization service resolves current person roles/memberships from the native session's subject ID. `AuthService` and the custom cookie middleware implementation are removed.
- Account IDs and UUIDv7 security revisions use the shared IdGen service. Revisions have an explicit database UUIDv7 constraint and no SQL random default; authentication and migration imports supply them.
- OAuth uses openid-client for provider protocol checks and Yielded Operations, RequestBinding, and AuthenticationCompletion for the application flow. The stock composed SQL adapter lacks OAuth sign-in storage; app-owned one-use flow/identity tables avoid implementing the full connected-grant subsystem or adding Drizzle. No upstream access/refresh token is retained.
- External identities are keyed by provider, validated issuer, and subject. Email matching never authorizes account linking. Linking requires the same authenticated account at begin and completion, with evidence no older than five minutes. New accounts require an explicitly verified mailbox; Microsoft users first use a magic link and connect their identity.
- Apple POST callbacks relay to first-party confirmation without consuming a flow. State and request-binding validation occurs on the subsequent CSRF-protected completion. Google/Microsoft use PKCE; all three validate signed ID tokens and nonce.
- OAuth flows expire within ten minutes. Beginning a new flow removes expired records; completion atomically consumes the exact bound flow before exchanging a code. Failure burns the flow, and provisioning remains transactional.
- SQL and Effect migrations are reset to a single Atlas-generated initial migration. Existing database files are preserved and must be replaced separately if they use an earlier schema.

Verification after this update: `pnpm run quality-gates` passed with 261 tests passing and 11 skipped; type checking and lint passed with existing warnings. Atlas migration validation passed. The full suite needs local HTTP-server access outside the restricted sandbox. No live Apple/Google/Microsoft credentials were available; protocol tests validate generated RSA-signed ID tokens, nonce/issuer/signature rejection, PKCE and Apple POST exchanges without contacting the providers.

## Subject naming and shared services follow-up

- Application fields and physical columns now use `authSubjectId`/`auth_subject_id` and `linkAuthSubjectId`/`link_auth_subject_id`. Library-owned `subjectId` metadata and storage-role keys retain Yielded's names.
- An incremental Atlas migration preserves populated subject references and converts existing session JSON claims from `accountId` to `authSubjectId`. The initial migration and old-schema migration fixtures retain their historical names.
- OAuth SQL definitions live in `queries.ts` and `mutations.ts`, with flow schemas in `oauth-domain.ts`; `oauth-storage.ts` owns provisioning orchestration.
- `server-services.ts` selects email delivery and supplies IdGen server-wide in both entry points. Authentication requires these services from its host. Tests reuse the existing TestLayer, production ID generation, and shared auth browser/email helpers.
- Signup grants NEWCOMER access, consistent with the people feature. Existing subjects retain their roles. Property tests cover both signup orders and explicit linking, provisioning rollback, exact one-use OAuth binding, and data-preserving migration across generated inputs.
- `authSubjectId` in claims is redundant with session metadata and is retained for the requested rename. Feature policies need person identity, current platform role, and current organization memberships; the latter two remain database-resolved, rather than frozen into authentication claims.

Verification: `pnpm run quality-gates` passed with 264 tests passing and 11 skipped. Atlas validation passed and reports no difference between the migration directory and `schema.sql`.
