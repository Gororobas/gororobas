# @yielded/auth-persistence

Direct Effect SQL persistence and shared storage contracts for `@yielded/auth`.

Import the named `AuthPersistence` facade and provide an explicit Effect SQL client.
Drizzle integrations live in `@yielded/auth-persistence-drizzle`; this package has
no Drizzle dependency or exports. Core workflows and replaceable service contracts
remain in `@yielded/auth`.

`OAuthServerPersistence` supplies independent, single-table consent and grant
storage for [MCP authorization](../../docs/src/content/docs/guide/oauth.mdx#authorize-mcp-clients).
Its conditional writes and monotonic revocation require standalone commits.

Applications own subject provisioning, policy, claims, delivery, and their database
connection and migration runner.

The composed Layer covers password sign-in and management, email address verification
and changes, phone sign-in, and passkey sign-in and management with stateful sessions
on PostgreSQL and SQLite. The `/Adapter` module exposes the shared mapping contracts
and transaction kernels used by companion adapters.
Its constructors acquire their database through the matching `Current*Sql` or
`NativeDatabase` service. Provide that dependency during construction only;
transaction coordinators supply their exact transaction when constructing bound
services. Keep root database provision outside later operations, where the
current SQL service identifies an active transaction.
See [persistence examples](../../docs/src/content/docs/reference/adapters.md#runnable-examples) for all
four ownership models and their current limits.
