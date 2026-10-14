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

## OAuth account settings

Run the browser journey with a GitHub OAuth App. Create an app in
[GitHub developer settings](https://github.com/settings/developers). Register an
exact callback entry; when reusing an app, retain the callbacks required by its
other consumers. See [GitHub's callback rules](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#redirect-urls).
Set the callback URL to `http://localhost:4185/oauth-settings/callback` for local
use, or `https://YOUR_HOST/oauth-settings/callback` for a hosted preview.

Supply `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_USER_ID` through
your server environment. The user ID is GitHub's numeric, stable ID (`gh api user
--jq .id`), not a username. Then run:

```sh
AUTH_DATA_DIR=/tmp/yielded-oauth-github \
  vp -C examples/persistence-sql run start:oauth
```

Open <http://localhost:4185/oauth-settings> and sign in with the configured GitHub
account. Choose **Link another account** to add a second GitHub identity you control.
The page lists linked logins and lets you remove one while preserving a usable
sign-in method. Linking cannot take an identity from another application account.

The configured user ID provisions the first account once. Changing it later does
not replace existing links. This example has no public registration or email-based
account matching.

`AUTH_PORT` defaults to `4185`. For an HTTPS reverse proxy, set `AUTH_ORIGIN` to
the external origin and register its exact callback URL; cookies become Secure.
The server binds `127.0.0.1`, so the reverse proxy must run on the same host. A
[Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
can provide a temporary preview: start `cloudflared tunnel --url http://127.0.0.1:4185`,
then use its HTTPS URL as `AUTH_ORIGIN`. Keep both processes running; a new tunnel
URL requires a matching callback registration.

GitHub requests `read:user` for sign-in. This app retains no provider grants and
keeps client secrets on the server. Tokens never enter session claims, browser
results, persistent storage or logs. See
[GitHub OAuth setup](../../docs/src/content/docs/guide/github.md).

### Policy, storage and client ownership

[The server](src/oauth-settings-server.ts) composes direct SQL mappings with
state-assisted signed sessions. Linking preserves sessions; unlinking invalidates
them immediately and protects the last usable sign-in method.

[The application policy](src/oauth-settings-auth.ts) requires verified authentication
from the last five minutes. Sign in again when it expires. This policy treats
recent provider sign-in as sufficient confirmation; applications requiring a
separate factor supply their own `OAuthActionEvidence`.

`AUTH_DATA_DIR` holds `auth.sqlite` and `oauth-settings-keys.json`, whose independent
random signing, transaction-encryption and binding keys are created with mode
`0600`. Keep keys stable across restarts and protect their directory. Set
`PERSISTENCE_DIALECT=pg` to use persistent PGlite in `postgres/` through the same
SQL mappings. Provisioning runs only for a new subject, so restarting cannot
restore a removed login. Reset only the chosen disposable directory and this
example's browser cookies to start over; this removes all its identities, sessions,
flows and keys. Deployed applications should own migrations, key rotation, expired
flow/tombstone cleanup, account provisioning and provider access policy.

[The shared contract](src/oauth-settings-contract.ts) exposes public package
operations. [Effect Atom](src/oauth-settings-client.ts) owns sign-in, redirect
metadata, callback completion, paginated listing and unlink. Named auth mutations
invalidate the listing automatically. React only renders and dispatches. The
callback consumes one attempt, clears code/state from browser history, and never
automatically retries an uncertain exchange. Session storage contains only the
attempt kind, public flow ID and expiry. Start again after expiry or cancellation;
after an uncertain response, inspect the current inventory before a new action.

## Hosted Yielded sign-in

The deployed service at `auth.yielded.dev` lives in
[`yielded-dev/site/apps/auth`](https://github.com/yielded-dev/site/tree/main/apps/auth).
That application owns the GitHub → Yielded → Agent journey, account policy,
signing keys, and Cloudflare deployment. This leaf remains a standalone OAuth
account-settings example. The reusable OpenID server stays in `@yielded/auth`;
see the [shared sign-in guide](../../docs/src/content/docs/guide/oauth.mdx#shared-sign-in-across-applications).

## OAuth lifecycle

Run a native CLI consumer with direct Effect SQL storage:

```sh
AUTH_DATA_DIR=/tmp/yielded-oauth-sqlite PERSISTENCE_DIALECT=sqlite \
  vp -C examples/persistence-sql run example:oauth-lifecycle

AUTH_DATA_DIR=/tmp/yielded-oauth-pg PERSISTENCE_DIALECT=pg \
  vp -C examples/persistence-sql run example:oauth-lifecycle
```

The consumer shows retained API access, login linking, registration, and reuse
of a persisted grant. `listAccountConnections` lists provider API grants;
`listLinkedAccounts` reads login identities.

It uses simulated Strava replies and private local action codes, so no provider
account or secret is needed. Its public demo keys and local delivery are unsuitable
for real credentials; use the browser example above for real provider consent.

[The entrypoint](src/oauth-lifecycle.ts) composes the same
[application-owned mappings](../shared/oauth/storage.ts) as the live GitHub/Strava
examples. [Lifecycle storage](src/oauth-lifecycle-storage.ts) adds registration
and account-management mappings. Both dialects use the same tables; PostgreSQL
runs through PGlite with native `bigint` decoding. Only these two dialects are shown.

Keep the data directory to replay against persisted state. Each run adds a new
registered demo identity. Reset only the chosen disposable `AUTH_DATA_DIR` to start
over; these commands use separate directories from the browser account app.
