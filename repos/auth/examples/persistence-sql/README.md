# Effect SQL without Drizzle

A runnable account app with registration, email verification, password recovery,
passkey enrollment and sign-in, and custom hashing through direct Effect SQL.
The application owns its SQL migrations, customer IDs, table names, and column
representations. There are no Drizzle imports or dependencies.

```sh
vp -C examples/persistence-sql run start
```

Open <http://localhost:4183> and create an account. This example keeps its own
database and keys under `.data/`; accounts from the Drizzle examples are separate.
Set the Cloudflare credentials in [.env.example](.env.example) to deliver email
from `hello@effect-agent.com`.

## Native browser sign-in

`/login` also serves [the Electron example](../browser-login-electron) and iOS
clients. Fresh sign-in returns automatically; an existing session asks for
confirmation. Authentication must be within five minutes, so an older session
may need to sign in again.

For a physical iPhone, put a reachable HTTPS reverse proxy in front of the server
and set `AUTH_ORIGIN` to that origin. `AUTH_PORT` defaults to `4183`; the server
binds loopback. Passkeys are tied to the configured host.

To reuse an existing session automatically, configure the iOS client with an
associated HTTPS callback and set `AUTH_IOS_RETURN_URL`, for example to your
web account page at `https://app.example.com/account`. Deploy and verify the
app/domain association first; see [association setup](../../docs/src/content/docs/reference/browser-login.md#apple-association).
The default registrations in [browser-login.ts](src/browser-login.ts) use custom schemes.

## Storage

`vp -C examples/persistence-sql run start:pg` starts the same app with persistent
PostgreSQL through `@effect/sql-pglite`. Choose one server at a time. [data.ts](src/data.ts)
selects the client Layer; a deployed app can supply `@effect/sql-pg` or another
Effect SQLite client through the same `SqlClient` service.

[schema.ts](src/schema.ts) maps the SQL descriptors in [tables.ts](src/tables.ts)
and [passkey-tables.ts](src/passkey-tables.ts). [migrations.ts](src/migrations.ts)
owns versioned DDL for both dialects. [live.ts](src/live.ts) shows subject provisioning
joining the auth transaction through the same SQL client.

All three SQL examples import the same [AuthApi](../shared/account/contract.ts),
[AppAuth](../shared/account/auth.ts), and [client](../shared/account/email-client.ts).
This app's [live.ts](src/live.ts) supplies its persistence and account Layers.
Hashing, Cloudflare delivery, forms, and Atom workflows also live in
[shared/account](../shared/account).
Adding a passkey requires authentication from the last five minutes. Sign in again
when prompted; an older valid session still permits ordinary account reads.
