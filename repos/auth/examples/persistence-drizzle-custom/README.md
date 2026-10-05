# Drizzle with application-owned schema and migrations

The account app from the managed example, with application-declared Drizzle tables
and Drizzle Kit migrations. It supports registration, Cloudflare email verification,
password recovery, and adding and signing in with passkeys.

Copy `.env.example` to `.env` and fill in `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`. `AUTH_EMAIL_FROM` defaults to `hello@effect-agent.com`.

```sh
vp -C examples/persistence-drizzle-custom run start
```

Open http://localhost:4182 and create an account. Each example has its own database;
this one's accounts, sessions, proofs, and passkeys persist in `.data/auth.sqlite`.
Private proof and request-binding keys persist in `.data/keys.json`.

[tables.ts](src/tables.ts) and [passkey-tables.ts](src/passkey-tables.ts) declare the
application's physical tables and columns. [schema.ts](src/schema.ts) connects them
with `Persistence.map({ subjects, tables })`. [Drizzle Kit](drizzle.config.ts) generates
SQL and snapshots from those declarations into [drizzle](drizzle). After changing a
table, generate a migration, then review and commit it:

```sh
vp -C examples/persistence-drizzle-custom run db:generate --name=describe_change
```

Generation compacts JSON snapshots to one line; Git marks them as generated.

[MigrationsLive](src/migrations.ts) applies the generated files with Drizzle and records
them in `__drizzle_migrations`. Run `vp -C examples/persistence-drizzle-custom run db:migrate`
to apply them separately. [live.ts](src/live.ts) also runs them before providing persistence;
startup never generates or pushes schema changes:

```ts
const DatabaseReady = MigrationsLive.pipe(Layer.provideMerge(Persistence.Config.layer(storage)));
```

The library supplies transactional auth operations. The application supplies customer
IDs, policy, claims, delivery, and custom hashing. Email confirmation and passkey
enrollment preserve the existing session. Enrollment requires authentication from
the last five minutes; sign in again when prompted. Use `localhost:4182` consistently
for passkeys.

`AUTH_DATA_DIR` selects another data directory. Removing this example's `.data`
resets only its accounts, sessions, credentials, and keys.

All three SQL examples import the same [AuthApi](../shared/account/contract.ts),
[AppAuth](../shared/account/auth.ts), and [client](../shared/account/email-client.ts).
This app's [live.ts](src/live.ts) supplies its persistence and account Layers.
Hashing, Cloudflare delivery, forms, and Atom workflows also live in
[shared/account](../shared/account).
