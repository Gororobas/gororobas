# @yielded/auth-persistence-drizzle

Drizzle bindings, table mappings, and migration helpers for Yielded Auth. This
package connects Drizzle tables to `@yielded/auth-persistence`; driver modules
supply transactions or atomic batches.

Import mapping helpers from the root and a driver from its explicit module, such
as `/Postgres` or `/SqliteBun`. Install `drizzle-orm` and the corresponding Effect
SQL driver. Supply Effect `Crypto` to persistence construction and transaction
coordinators. Composed drivers expose `AuthPersistence`; explicit driver modules
also expose lower-level factories.

Bun consumers need the
[@yielded/drizzle-effect-v4-patch](../drizzle-effect-v4-patch/README.md).
Use its supported Drizzle release and commit the generated patch and lockfile.

Applications own subjects, policy, claims, delivery, and database connections.
Drizzle Kit generates migrations from managed or application-declared tables.
Provide `AuthPersistence.migrationsLayer({ migrationsFolder })` explicitly to
apply those files before starting auth.

D1 also supports managed tables through `AuthPersistence.make(auth).managed(...)`.
Supply the primary D1 binding through `D1Client.layer` and apply generated SQL
with `AuthPersistence.migrationsLayer({ migrations })` using bundled SQL,
or with your existing D1 migration runner. Its composed services use atomic batches.
OAuth sign-in and retained provider access use the same managed composition.
Password provisioning returns subject values through `Persistence.Provisioning`;
the library commits the account and credentials together.

SQLite/D1 and PostgreSQL driver modules also expose `OAuthProxyPersistence` for
[callback proxy storage](../../docs/src/content/docs/reference/oauth.md#callback-server).

Durable Object SQLite uses Effect SQL’s asynchronous transaction owner. Use
`SqliteDo.databaseLayer` or `SqliteDo.makeDatabase(existingDrizzle)` so cryptography
can suspend inside the owned transaction; arbitrary raw Drizzle outer
transactions are unsupported.

See the [adapter guide](../../docs/src/content/docs/reference/adapters.md) for transaction ownership,
runtime constraints, and runnable examples.
