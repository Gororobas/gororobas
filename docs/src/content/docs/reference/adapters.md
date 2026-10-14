---
title: Adapters and persistence
description: Choose managed storage, your own SQL schema, or custom Effect services.
---

`@yielded/auth` owns workflows and service contracts. `@yielded/auth-persistence`
supplies direct Effect SQL persistence; `@yielded/auth-persistence-drizzle` adds
Drizzle bindings, managed tables, and migration helpers. Applications own subjects,
provisioning, policy, claims, delivery, database connections, and migrations.

## Runnable examples

[Database and backend choices](../guide/storage) explains the ownership model.
The [four account apps](../guide/examples#run-an-account-app) show complete setup
with managed Drizzle, an application-owned Drizzle schema, direct Effect SQL, and
custom services.

## In-memory testing

`Testing.layer(auth, options)` from `@yielded/auth-persistence/Testing` replaces
password and session persistence in tests. See the
[setup guide](../guide/storage#in-memory-tests) or [consumer test](https://github.com/yielded-dev/auth/blob/main/examples/auth/test/in-memory.test.ts).

- **`auth`**: One sign-in-only `Password.make()` strategy and `Sessions.stateful()`. Other configurations fail acquisition with `PersistenceConfigurationError`.
- **`subjects`**: Each seed has `subjectId`, `email`, a redacted `password`, and optional `active` (default `true`). Duplicate IDs or normalized emails fail acquisition. Emails remain unverified.
- **`requirement`**: Required application `AuthenticationRequirement`; no test default.
- **`PasswordHashing`**: Required Layer dependency. Hashes seed passwords without text normalization. `Testing.services()` supplies this and Effect `Crypto`; claims remain application-owned.
- **Clock**: Uses the caller's clock. Effect's `TestClock` controls expiry.

Supported session operations are issuance, verification, renewal, listing,
revocation, and sign-out. Renewal invalidates the previous credential; retrying
with it fails. Each successful sign-in creates a new session.
Password management, pending authentication, handoff, signed-session approval,
and ambient transaction composition are unsupported.

Separate acquisitions have independent state; reusing a Layer within one build
shares it. State is process-local, non-durable, and discarded on scope close.
In a Worker, acquire and use it within the request or test scope. Use your
production adapter to verify database concurrency or recovery.

### Test services

`Testing.services(options?)` supplies Effect `Crypto` and `PasswordHashing` with
portable Argon2id at the default password cost. Provide it to both Auth and
`Testing.layer`.

| Option or requirement | Behavior                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `seed`                | Optional string or number. Equal seeds and operation order reproduce credentials; use distinct seeds for independent simulated clients. Omit for secure host randomness. |
| Runtime               | Requires global WebCrypto. Missing WebCrypto fails acquisition with `PersistenceConfigurationError`.                                                                     |
| Clock                 | Inherits the caller's clock. It does not install a test clock or replace Effect's `Random` service.                                                                      |

You can supply your own crypto and hashing Layers instead. Promise-based test
runners can use `ManagedRuntime.make(TestAuth)` and dispose it after each test.

## Compose persistence once

Use the named `AuthPersistence` facade from your [driver](#choose-a-driver), or
from `@yielded/auth-persistence` for direct Effect SQL. Bind it with
`AuthPersistence.make(AppAuth)`; the [storage guide](../guide/storage#managed-tables)
shows the subject mapping.

`Persistence.managed({ subjects, prefix, tables? })` creates tables for enabled
capabilities, with optional overrides in `tables`. Keep `prefix` explicit and
stable: changing it selects different tables, not the existing credentials.
Use `Persistence.map({ subjects, tables })` when you declare every table yourself.
Export enabled tables from `storage.schema` as named exports for Drizzle Kit;
see the [managed schema](https://github.com/yielded-dev/auth/blob/main/examples/persistence-drizzle-managed/src/schema.ts).

Provide the configuration and database before using persistence:

```ts title="apps/server/auth-live.ts"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { AuthPersistence } from "@yielded/auth-persistence-drizzle/SqliteBun";
import { WebCrypto } from "@yielded/auth";
import { Layer } from "effect";
import { AppAuth } from "./auth";
import { ApplicationLive } from "./application"; // claims, keys, delivery, hashing
import { Persistence, storage } from "./schema";

const DatabaseLive = SqliteClient.layer({ filename: "auth.sqlite" });
const ConfigLive = Persistence.Config.layer(storage);
const DatabaseReady = AuthPersistence.migrationsLayer({
  migrationsFolder: new URL("./drizzle/", import.meta.url).pathname,
}).pipe(Layer.provideMerge(ConfigLive), Layer.provideMerge(DatabaseLive));
export const AuthLive = AppAuth.layer.pipe(
  Layer.provide(Persistence.layer),
  Layer.provide(ApplicationLive),
  Layer.provide(DatabaseReady),
  Layer.provide(WebCrypto.layerCryptoWeb),
);
```

Generate, review, and commit migrations before startup. `migrationsLayer` applies
committed files and stops startup on failure; it does not generate or push schema
changes. SQLite WASM and D1 take a `migrations` map instead of a folder. Direct
Effect SQL applications supply their own migration runner.

The composed Layer validates mapped columns and unique keys on its first storage
operation. Its configured SQL client's connection acquirer can read services from
the invoking request during initialization and subsequent operations. Build
persistence in the same scope as its SQL client and rebuild it after schema changes
or failed initialization. Canceling one caller leaves setup
running for other waiting callers. Interrupted setup requires rebuilding the Layer
before storage operations resume. Cookie-cached and anonymous session reads do
not trigger initialization.

Composition supports password sign-in, registration and management, email address
verification and changes, phone sign-in, passkey sign-in and management, OAuth
sign-in and connected grants, and stateful sessions on PostgreSQL and SQLite.
OAuth-only definitions also support `Sessions.stateless()`: flows, grants, and
issuance authority remain durable; session verification uses signed credentials.
Stateless sessions retain their configured lifetime after authority changes.
State-assisted sessions and other stateless strategy combinations use explicit
storage Layers.

Email storage permits one verified address per subject and email module.
Composed tables use canonical logical column names and text auth IDs; subject ID
codecs and order-preserving timestamp codecs remain application-owned.

For password registration, supply `Persistence.Provisioning` under the strategy's
name:

```ts
const ProvisioningLive = Layer.succeed(Persistence.Provisioning, {
  password: { values: customerValues },
});
const PersistenceLive = Persistence.layer.pipe(Layer.provide(ProvisioningLive));
```

`customerValues({ requestId, registration, identifier })` returns subject insert
values, including the allocated ID, active status, and initial security revision.
Use logical column names. Preparing values must not write to the database or perform
external side effects. The library commits the subject and credentials together;
an occupied identifier never overwrites a password. `requestId` is stable for the
application operation.

Interactive drivers also accept `password: createCustomer`, which inserts through
the owning Effect SQL client and returns the subject ID. D1 requires `{ values }`.
See the [managed wiring](https://github.com/yielded-dev/auth/blob/main/examples/persistence-drizzle-managed/src/live.ts).
`subjects.actionRequirements` defaults to `subjects.requirements`; override it for
a distinct recovery or credential-change policy.

Standalone mutations reject ambient transactions. Use an explicit coordinator to
combine auth and application writes under one owner. Credentials and lifecycle
events are released only after that owner commits. An unknown outcome does not
authorize repeating credential issuance or delivery.

### Workers and request-scoped SQL

Share `WorkerdServices` across requests to retain its KDF admission limits. The
simplest composition builds auth and persistence per request with one SQL client
for auth, application queries, and explicit coordinators. Workers
[TCP sockets belong to the request](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#considerations),
whether connecting directly or through Hyperdrive.

Inside an [Alchemy Worker constructor](https://alchemy.run/infrastructure-as-effects/runtime/),
bind Hyperdrive once and acquire SQL inside the handler. Imports and application
wiring are elided: `AuthLive` supplies auth and persistence but requires SQL;
`workerdServices` is the shared context built from `WorkerdServices.layer`;
`handleRequest` is an Effect HTTP handler returning `HttpServerResponse`.

```ts
const hyperdrive = yield* Cloudflare.Hyperdrive.Connect(Database);

return {
  fetch: Effect.gen(function* () {
    const url = yield* hyperdrive.connectionString;
    const SqlLive = PgClient.layerFrom(PgClient.makeClient({ url }));
    const RequestLive = AuthLive.pipe(Layer.provideMerge(SqlLive), Layer.orDie);

    return yield* handleRequest.pipe(Effect.provide(RequestLive, { local: true }));
  }).pipe(Effect.provide(workerdServices)),
};
```

`{ local: true }` gives each request its own Layer build and scope.
`PgClient.makeClient` opens one physical client; `layerFrom` exposes it as both
`PgClient` and `SqlClient`. Finish SQL work inside the handler Effect: its scope
closes the client when the Effect completes, including on failure or interruption.

Provide Alchemy's `Cloudflare.Hyperdrive.ConnectBinding` and enable `nodejs_compat`
in the Worker setup. Set `caching: { disabled: true }` on the Hyperdrive resource
so auth reads observe current state ([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)).
For a direct connection, substitute a redacted database URL for `url`.

Applications that already share persistence Layers can supply a logical `SqlClient`
whose acquirer resolves the invoking request's scoped physical client. Initialization
and later operations use that request context. Keep the shared Layer tied to one
database and mapping; schema checks run once per Layer, not once per connection.

### Mix composed and explicit services

Pass the complete `AppAuth` to `AuthPersistence.make`. Provide explicit services for
strategies outside its composed capabilities, such as [OAuth registration and account
linking](#oauth), alongside `Persistence.layer`. Share subject identity, status,
policy, security revisions, and the complete active credential authority; credential
changes must maintain that authority atomically. The default composed passkey-removal
policy does not count OAuth as a remaining sign-in method; use an
[explicit removal policy](#passkeys) when it should.

### Managed D1

Import `AuthPersistence` from `@yielded/auth-persistence-drizzle/D1` and supply
`D1Client.layer({ db: env.DB })`, Effect `Crypto`, and `PasskeyConfig` when using
passkeys. Use the original D1 database binding, not a
[D1 read-replica session](https://developers.cloudflare.com/d1/best-practices/read-replication/).
The same composed API uses atomic batches rather than interactive transactions;
password provisioning must return subject values as described above.

Export the managed tables for Drizzle Kit. Bundle generated SQL and apply it before
serving auth, or use your D1 migration runner:

```ts
const MigrationsLive = AuthPersistence.migrationsLayer({
  migrations: { "20261008120000_initial": initialSql },
});
```

Each key is the generated migration directory name; each value is SQL text including
Drizzle's statement breakpoints. Supply `D1Client` and Effect `Crypto` to this Layer.
It needs no filesystem. Run one migration owner at a time.

## Connect password storage

For explicit SQLite-on-Bun mappings, supply the driver database Layer:

```ts title="apps/server/auth-persistence.ts"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { Effect, Layer } from "effect";
import {
  databaseLayer,
  makePasswordPersistenceServices,
} from "@yielded/auth-persistence-drizzle/SqliteBun";
import { Password } from "@yielded/auth";

import { passwordMapping } from "./schema";

export const PasswordPersistenceLive = Layer.effect(
  Password.PasswordPersistence,
  Effect.map(
    makePasswordPersistenceServices(passwordMapping),
    (services) => services.passwordPersistence,
  ),
).pipe(
  Layer.provide(databaseLayer),
  Layer.provide(SqliteClient.layer({ filename: "auth.sqlite" })),
);
```

`passwordMapping` is a `PasswordPersistenceMapping` from
`@yielded/auth-persistence-drizzle`. Supply `LifecycleHooks`, Effect `Crypto`, and
your account/session Layers at the composition root. Driver factories and
coordinators need `Database` and `Crypto` at acquisition; provide crypto to both
persistence and Auth.

A replacement `PasswordPersistence.findCredential` returns an optional coherent
credential snapshot without writes or a transaction held across hashing.
`rehashIfCurrent` conditionally updates the verifier when hash parameters change;
a lost comparison is a no-op. Rate limits belong to `PasswordAttemptLimiter`, not
the persistence mapping.

## Compose the application Layer

```ts title="apps/server/auth-dependencies.ts"
import { Layer } from "effect";
import { Auth, Hooks, Proofs } from "@yielded/auth";
import { CryptoLive } from "./crypto-live";

import { AccountsLive } from "./auth-accounts";
import { requestBinding, proofKeys } from "./auth-config";
import { SessionPersistenceLive } from "./session-persistence";

export const AuthDependencies = Layer.mergeAll(
  Auth.RequestBindingConfig.layer(requestBinding),
  Proofs.ProofKeys.layer(proofKeys),
  SessionPersistenceLive,
  AccountsLive,
  Hooks.LifecycleHooks.empty,
).pipe(Layer.provideMerge(CryptoLive));
```

[`CryptoLive`](./crypto#use-with-auth) is your shared crypto Layer. `proofKeys` is
your secret-managed code keyring; retain old key IDs until their proofs expire.

`AccountsLive` supplies `Sessions.AuthenticationAuthority`.
`SessionPersistenceLive` supplies `AppAuth.sessions.StatefulSessionPersistence`
and `AppAuth.sessions.SessionRepository`. Method and session mappings must share
subject identity, active status, security revision, policy, and the complete active
credential authority. Credential changes must maintain that authority atomically.
Neither account authority nor session persistence has an automatic default.

Provide these dependencies and the method Layers to `AppAuth.layer` or
`Http.layer(AppAuth, options)`. Keep `Auth.AuthRequest` request-scoped; the
[HTTP adapter](../guide/http-and-client) supplies it for HTTP calls.

### Defaults and required configuration

`Auth.make` wires selected methods, sessions, and empty lifecycle hooks.
Supply crypto and `PasswordHashing` explicitly, for example with
[`Password.PasswordHashing.layer()`](../guide/passwords#supply-the-services).
Layer helpers may default to empty hooks; storage, account authority, claims,
delivery, and secret keys remain application responsibilities.

## Choose a driver

| Database / runtime    | Direct import                                  |
| --------------------- | ---------------------------------------------- |
| PostgreSQL            | `@yielded/auth-persistence-drizzle/Postgres`   |
| PGlite                | `@yielded/auth-persistence-drizzle/Pglite`     |
| MySQL                 | `@yielded/auth-persistence-drizzle/Mysql2`     |
| libSQL                | `@yielded/auth-persistence-drizzle/Libsql`     |
| SQLite on Bun         | `@yielded/auth-persistence-drizzle/SqliteBun`  |
| SQLite on Node        | `@yielded/auth-persistence-drizzle/SqliteNode` |
| SQLite WASM           | `@yielded/auth-persistence-drizzle/SqliteWasm` |
| Cloudflare D1         | `@yielded/auth-persistence-drizzle/D1`         |
| Durable Object SQLite | `@yielded/auth-persistence-drizzle/SqliteDo`   |

`AuthPersistence` is available on PostgreSQL, PGlite, libSQL, SQLite Bun/Node/WASM,
and D1. MySQL and Durable Object SQLite expose explicit persistence services.

Install the driver's declared Effect SQL and Drizzle peers and import it directly.
Bun consumers also need the [Drizzle Effect patch](https://github.com/yielded-dev/auth/tree/main/packages/drizzle-effect-v4-patch);
follow its installation instructions and commit the generated patch and lockfile.
Shared mapping types live in `@yielded/auth-persistence-drizzle`.

Use `databaseLayer` to acquire `Database` from the platform SQL client. Most drivers
also accept `Layer.succeed(Database, db)`. Durable Object SQLite uses
`SqliteDo.databaseLayer` or `SqliteDo.makeDatabase(existingDrizzle)` with an Effect
SQL client configured with Durable Object `storage`. Its asynchronous transaction
owner supports suspending Effects; raw Drizzle outer transactions are unsupported.

Standalone libSQL operations reject any ambient libSQL transaction, including one
belonging to another client. Use the adapter's coordinator for shared commits.

The native PostgreSQL driver accepts one statement per query and decodes `int8`
as `bigint`, timestamps as `Date`, and `bytea` as `Uint8Array`. Match your column
codecs to those values, use `sql.json` for JSON parameters, and set `prepare: false`
for poolers that cannot retain prepared statements.

Adapter authors can supply typed mappings or implement `NativeSqlTables` through
`@yielded/auth-persistence/Adapter`. `yield* makeStorageMappings(storage)` from that
module supplies shared row codecs for explicit mappings and requires Effect `Crypto`.
Include every role table the requested mappings use.

## SQL session verification

Explicit SQL session reads check current authority and expiry; committed revocations
invalidate sessions immediately. Application claims remain application-owned.
Session listing includes only the current security revision. If concurrent authority
changes prevent a coherent page, listing fails with `SessionUnavailable` rather than
reporting pagination exhaustion.

Keep mapped subject IDs canonical through every column codec. PostgreSQL UUID
keys can coexist with text subject references; use the same lowercase UUID spelling
throughout. Logical column types describe driver values, not migration DDL.
Permit database catalog reads: explicit session factories validate required keys and
column compatibility at acquisition; composed storage and direct OAuth factories
validate on their first operation.
Schema declarations do not install constraints. Apply migrations before use and
reacquire persistence Layers after schema changes.

Explicit session mappings require `moduleId`, the engine clock, and native
active-status values. Declare every mutable input of `decodeRequirement` in
`subject.requirementColumns`; D1 requires this declaration. Use `[]` only for
constant policy.

`SessionPendingTables` maps `Login` and `StepUp` storage; the Login codec must
preserve application claims. `SessionCleanup` shares one deletion limit across
expired pending proofs and due revocation tombstones. See
[session maintenance](./sessions#custom-composition).

Provide the same `Operations.AuthenticationClock` Layer to Auth and independently
acquired persistence services; see [clock configuration](./sessions#independent-clocks).
Custom adapters follow the timing and expiry contracts on their persistence ports.

## Passwords

`makePasswordPersistenceServices` supplies verification and mutation storage;
`makePasswordRegistrationServices` supplies registration authority. Reset support
also needs a proof mapping.

`PasswordAttemptLimiter` defaults to process-local token buckets with a 10,000-key
capacity, reset on restart. Multiple replicas and per-request runtimes need a
[shared store](../guide/passwords#share-rate-limits) for identifier and subject
buckets; the action bucket stays per instance. Consumed tokens are not refunded.

Use the adapter's coordinator when combining password mutations with application
writes. Conflicting changes to the account, credential, or redeemed proof roll
back the shared commit.

## Proof storage

Map one current code per module, purpose, and canonical identifier or subject
series. Protected password, email, and phone changes consume the proof in the same
commit. Standalone sign-in consumes its proof before issuing a session.

Cleanup takes `CleanupLimit` and returns `{ removed, hasMore }`; `hasMore` means the
limit was reached, not that another call must remove rows. Retired phone identifiers
are permanent and are never removed by cleanup.

## Email

`makeEmailSignInServices` supplies lookup. `makeEmailRegistrationServices` and
`makeEmailAddressServices` supply account creation and address changes. For explicit
mappings over an existing layout, use `.emails()` and `.proofs()` from
`yield* makeStorageMappings(storage)`.

Registration provisions a fresh subject after mailbox proof. Application policy
may reclaim an active, unverified address, never a verified one; scope that
permission to registration. Reclamation advances the previous subject's security
revision without moving credentials or application data or re-enabling a disabled
subject. Storage-backed sessions can invalidate immediately; purely stateless
sessions retain their configured lifetime.

Provisioning, identifier ownership, and proof consumption share one transaction or
D1 batch. Provisioning is synchronous and receives a stable `requestId` for
application idempotence. See [mailbox registration](../guide/codes#register-a-mailbox-owner).

Confirming an existing unverified address for the same subject preserves sessions
and omits `invalidation`. Application policy may allow confirmation with a valid
session; adding or replacing an address requires recent authentication and advances
security revisions. Reload mutable claims on session reads when verification must
appear immediately. Notifications run after commit; durable delivery needs an outbox.

## OAuth

`OAuth.make()` participates in `AuthPersistence.make(auth).managed(...)` and
`.map(...)` on the composed PostgreSQL and SQLite drivers, including Drizzle D1.
`OAuth.make({ access: profile })` and `OAuth.makeConnected({ policy })` also install
connected-grant and revocation storage. Applications supply existing login links,
provider configuration, encryption keys, claims, and action/use authorization.

OAuth adds these roles; each physical table is named `${prefix}_${role}`:

- **`oauthIdentities`**: provider identity ownership shared by login and retained grants.
- **`oauthCredentials`**: login credentials tied to the shared `credentials` authority.
- **`oauthSignInFlows`**: single-use sign-in flows, enabled by `OAuth.make`.
- **`oauthConnectedFlows`**: connect and reconnect flows, enabled by retained access or `makeConnected`.
- **`oauthConnectedGrants`**: encrypted grants and refresh state, enabled with connected flows.
- **`oauthConnectedRevocations`**: durable provider-revocation work, enabled with connected flows.

`OAuth.makeRegistration` and `OAuth.makeAccounts` use explicit storage Layers for
application provisioning, login linking, and unlinking policy. The
`OAuthPersistence` module from `@yielded/auth-persistence` supplies their factories
and custom upstream provider-account mappings. Downstream authorization uses
`OAuthServerPersistence`.

- **`makeOAuthSignInServices`**: Single-use sign-in flows and existing login credentials
- **`makeOAuthRegistrationIntentServices`**: Verified identity to registration intent
- **`makeOAuthRegistrationServices`**: Application provisioning, login credential, and durable receipt
- **`makeOAuthAccountsServices`**: Linked login inventory, linking, and safe unlinking
- **`makeOAuthConnectedServices`**: Retained grants, listing, use, refresh, and disconnect
- **`makeOAuthConnectedRevocationServices`**: Durable provider-revocation work

Direct Effect SQL supports PostgreSQL and SQLite with interactive transactions,
not MySQL or D1 batches. Drizzle applications use their driver entrypoints.
The [Effect SQL consumer](https://github.com/yielded-dev/auth/tree/main/examples/persistence-sql)
has no Drizzle dependency.

Direct OAuth factories capture their dependencies at construction and defer database
access until their first operation. Required schema checks still run before that
operation; a missing key fails with `OAuthUnavailable` before any write. Rebuild the
services after schema changes or failed validation. On Workers, supply a
[request-scoped SQL connection](#workers-and-request-scoped-sql).

Describe tables with `OAuthPersistence.table` and map columns, row codecs, subject
IDs, authority policy, and required unique keys. `OAuthPersistence.clock` supplies
an integer-millisecond engine clock. Use its `sql`, `eq`, and `and` for mapping
expressions; application queries use the supplied Effect `SqlClient`.

```ts
import { OAuthPersistence } from "@yielded/auth-persistence";
import { Persistence } from "@yielded/auth";
import { Layer } from "effect";

import { SqlLive, CryptoLive, signInMapping } from "./infrastructure";

export const OAuthStorageLive = OAuthPersistence.oauthSignInPersistenceLayer(
  OAuthPersistence.makeOAuthSignInServices(signInMapping),
).pipe(Layer.provide([SqlLive, CryptoLive, Persistence.hooksLayer]));
```

Reuse the session `AuthenticationAuthority`. If it is not already supplied, use
`makeAuthenticationAuthorityServices` with the same subject and shared credential
mapping, including all active credentials rather than only OAuth logins.

For atomic application work, `coordinateOAuth*({ mapping }, body)` provides
transaction-bound persistence to `body`; registration also takes its `target`
service. Queries through the same `SqlClient` join that transaction. Keep provider
network exchanges outside it and do not retain bound services after it ends.
An unknown exchange or commit outcome requires a fresh ceremony, not a repeated
provider exchange.

Account mappings require a self-contained `metadataAccess` SQL predicate enforcing
current permission for the verified invocation. False returns an empty page.
`OAuthAccountsPersistence.list` exposes credential IDs and provider/issuer/subject
tuples, not application profiles. Retained-grant listing belongs to
`OAuthConnectedPersistence`.

### Kysely-owned schemas

Kysely can own migrations and application queries while Effect SQL maps the same
tables. A Kysely transaction is not an Effect SQL transaction. Provisioning and auth
writes that must commit together must use the adapter's coordinator and its exact
SQL client, or a replacement persistence service that owns both operations.

## Passkeys

`makePasskeyPersistenceServices` supplies challenge storage; `PasskeyCredentials`
supplies credential lookup and `listForSubject`. Provide `PasskeyConfig`, action
authorization, claims, and a protocol verifier. Composed tables use integer
milliseconds; custom timestamps require explicit mappings. Challenges retain their
selected relying-party profile until expiry.

A failed or uncertain challenge consume or session issuance requires a new
ceremony. Enrollment preserves existing sessions. Removal protects the last usable
sign-in method and invalidates sessions; registration provisions synchronously.
The composed removal policy counts only passwords or user-verified passkeys that
independently satisfy sign-in requirements, not OAuth logins. Use an explicit
adapter's `write.policy.remainingSignIn` for other methods or factor combinations.

Use `coordinatePasskeyManagement` or `coordinatePasskeyRegistration` for application
writes in the same transaction. A failed auth operation aborts that transaction
even if the application catches the error; retry in a fresh transaction.

Passkey rate limits default to a bounded process-local store. Supply a
[shared store](../guide/passwords#share-rate-limits) for subject and target limits
across replicas; the global budget stays per instance.

## TOTP

`TotpMapping.subject.requirementColumns` follows the
[session mapping contract](#sql-session-verification): declare every mutable policy
input, or `[]` for constant policy. D1 rejects omission.

Recovery reset uses the same Login pending table and codec as sessions; a step-up
intent cannot authorize it. Recovery-code regeneration preserves the subject
revision and existing sessions.

## Phone

The composed Layer supplies phone sign-in and proof services. For number lifecycle
operations or specialized mappings, use the explicit services:

<!-- #region phone-layers -->

```ts title="apps/server/auth-persistence.ts"
import { Effect, Layer } from "effect";
import { phonePersistenceLayer } from "@yielded/auth-persistence-drizzle";
import {
  databaseLayer,
  makePhonePersistenceServices,
  makeProofPersistenceServices,
} from "@yielded/auth-persistence-drizzle/SqliteBun";
import { Proofs } from "@yielded/auth";

import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { CryptoLive } from "./crypto-live";
import { phoneMapping, proofMapping } from "./schema";

const DatabaseLive = databaseLayer.pipe(
  Layer.provide(SqliteClient.layer({ filename: "auth.sqlite" })),
);

export const PhonePersistenceLive = phonePersistenceLayer(
  makePhonePersistenceServices(phoneMapping),
).pipe(Layer.provide([DatabaseLive, CryptoLive]));

export const ProofPersistenceLive = Layer.effect(
  Proofs.ProofPersistence,
  Effect.gen(function* () {
    const services = yield* makeProofPersistenceServices(proofMapping);
    return services.proofPersistence;
  }),
).pipe(Layer.provide([DatabaseLive, CryptoLive]));
```

The phone Layer supplies `PhonePersistence` and `PhoneSignInTargets` with empty
hook defaults. Both Layers use your `CryptoLive`. Configure `ProofLimiter` and
`PhoneAdmission` separately from storage. You own mappings and migrations; see the
[SQLite example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/phone-sqlite-bun.ts).

<!-- #endregion phone-layers -->

## Connected OAuth grants

Managed composition checks configured profiles and current subject/credential
authority. Strategies sharing an OAuth namespace use the same connected policy.
Return the subject's `securityRevision` as `policyRevision` from
`OAuthConnectedUseAuthority`; advance it whenever connected-access policy changes.
Provider-revocation jobs start with thirty days of retention and require an
application-scheduled maintenance worker.

For independent SQL policy or custom storage, use
`OAuthPersistence.makeOAuthConnectedServices` and
`OAuthPersistence.makeOAuthConnectedRevocationServices`. Map `otherReferences` to
an indexed predicate covering login, grant, and job references sharing identity
ownership. `policy.condition` supplies additional application policy. Retained
sign-in also maps `credential` to the shared login table; see the
[explicit storage example](https://github.com/yielded-dev/auth/blob/main/examples/shared/oauth/storage.ts).

An expired refresh claim requires fresh provider authorization after an uncertain
exchange. Cleanup takes `CleanupLimit` and returns `{ removed, hasMore }`, where
`hasMore` means the batch limit was reached.

See [integration references](../guide/examples#database-adapters) for complete
mappings and driver setup.
