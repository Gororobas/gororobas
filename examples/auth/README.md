# Authentication examples

Consumer examples compose public `@yielded/auth` exports with application-owned
identity, persistence, and delivery. `getting-started.ts` shows application
composition; `session-contract.ts` and `session-http.ts` show the minimal session
service, cookies, selected routes, and protected HttpApi group. The runnable password, email, phone, session, and proof programs
use local example data. Filled-byte keys are demo-only: generate independent random
32-byte keys for production, store them in your secret configuration, and retain
old key material while credentials or persisted records reference it.

`auth-contract.ts` owns the shared named API; `auth-server.ts` mounts it beside
application routes. `auth-client.ts` declares the client and its atoms;
`auth-react.ts` uses the application's standard Atom registry and React hooks.
`auth-ssr.ts` shows request-owned server rendering and browser hydration;
the host keeps each Scope alive until its render or mounted application finishes.

Run a declared example through `vp run -F @yielded/example-auth <task>`.
All consumer files are checked by the root validation command. TOTP adapter
fixtures that exercise private implementation helpers live under the library’s
`test/fixtures`, where they remain typechecked.

The Studio example's storage and HTTP Layers require `Postgres.Database`; provide
`Postgres.databaseLayer` with an Effect PostgreSQL client at the application boundary.
`makeStudioLive(binding)` also requires `TotpSecretKeys`. Supply its Layer alongside
the database Layer; shared dependencies stay visible in Layer requirements.

`login-contract.ts`, `login-server.ts`, and `login-client.ts` compose email OTP +
GitHub with shared sessions, HTTP, and Atom workflows. Google is optional.
See the [OAuth guide](../../docs/src/content/docs/guide/oauth.mdx) for setup.

`example:github`, `example:strava`, and `example:strava-mcp` build their Atom browser
client and run a single-owner OAuth application. `oauth-application.ts` composes
`Auth.make` with `OAuth.make({ access: profile })`; `oauth-storage.ts` owns the
explicit libSQL schema and allowlisted account provisioning. Provider grants use
the same connected storage and refresh engine as authenticated account connections.
Open `/login` and configure the provider callback at `/auth/{provider}/callback`.
See [OAuth setup](../../docs/src/content/docs/reference/oauth.md#runnable-examples)
for environment variables and the development-state reset.

The examples allow sign-in and current-owner grant metadata/use. Management requires
an application-owned exact-action verifier and is denied until one is installed.
Run cohort revocation maintenance through an application-owned scheduler if enabling
management for a provider that supports remote revocation.

For a later clean-start cutover, reset old accounts, auth/session/proof state,
per-account trips/conversations/settings/encrypted API keys, and browser caches.
Retire associated generated sites and build/address records. Allocate new subjects
and storage namespaces; users re-register and re-enter API keys. The consumer
release owns this reset; these examples perform no deletion.
