# @yielded/auth-persistence

Direct Effect SQL persistence and shared storage contracts for `@yielded/auth`.

Import the named `AuthPersistence` facade and provide an explicit Effect SQL client
and Effect `SecureRandom` and `Digest` to its Layer. Managed storage requires a stable `prefix`; use
the existing table prefix when connecting an existing database.
Drizzle integrations live in `@yielded/auth-persistence-drizzle`; this package has
no Drizzle dependency or exports. Core workflows and replaceable service contracts
remain in `@yielded/auth`.

`OAuthPersistence` supplies upstream provider sign-in, registration, login linking and
unlinking, and retained grants through explicit table mappings on PostgreSQL and
SQLite with interactive transactions. Provide `SqlClient`, Effect `SecureRandom` and `Digest`, and
lifecycle hooks; applications own subjects, policies, keys, and migrations. See the
[OAuth adapter reference](../../docs/src/content/docs/reference/adapters.md#oauth)
and [runnable Effect SQL consumer](../../examples/persistence-sql).

`OAuthServerPersistence` supplies independent, single-table consent and grant
storage for [MCP authorization](../../docs/src/content/docs/guide/oauth.mdx#authorize-mcp-clients).
Its conditional writes and monotonic revocation require standalone commits.

`OAuthProxyPersistence` stores encrypted attempts for the
[OAuth callback proxy](../../docs/src/content/docs/reference/oauth.md#callback-proxy)
on SQLite/D1 or PostgreSQL. Its operations require standalone commits.

Applications own subject provisioning, policy, claims, delivery, and their database
connection and migration runner. On Workers, use a [request-scoped SQL connection](../../docs/src/content/docs/reference/adapters.md#workers-and-request-scoped-sql)
and shared `WorkerdServices`.

The composed Layer covers password sign-in and management, email codes, magic links
and address management, phone sign-in and enabled lifecycle operations, passkey sign-in
and management, OAuth sign-in with optional retained access, and connected accounts
with stateful sessions on PostgreSQL and SQLite. OAuth and email sign-in also support
stateless sessions without a session table; identity authority, proofs, and OAuth flows
remain durable. Other stateless combinations and state-assisted sessions require explicit
persistence services.
Phone signup supplies subject values through `Persistence.Provisioning`; applications
retain delivery, claims, and authorization for number verification and changes.
Guest email registration requires explicit services.
OAuth registration and login linking/unlinking still use explicit `OAuthPersistence`
mappings. Applications provision login identities and supply OAuth action evidence,
use authorization, provider configuration, and encryption keys.
Adapter authors use typed table mappings or
`NativeSqlTables` through `/Adapter`. Use the explicit coordinators when auth and
application writes must share one commit; independent transaction owners are not atomic.
See [persistence examples](../../docs/src/content/docs/reference/adapters.md#runnable-examples) for all
four ownership models and their current limits.

The opt-in [`Testing` module](../../docs/src/content/docs/guide/storage.mdx#in-memory-tests)
provides non-durable password and session storage. Supply an Effect Kdf Layer with
Argon2id support when using its test services.
