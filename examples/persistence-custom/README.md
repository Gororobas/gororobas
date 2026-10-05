# Custom auth services

A complete account app using `@yielded/auth`, application-owned persistence, and
replaceable Effect services. No Drizzle, Effect SQL, or persistence package.

```sh
vp -C examples/persistence-custom run start
```

Open [localhost:4184](http://localhost:4184), create an account with a username,
verify its email, and add a passkey while signed in. Sign in with either username
or email. Password recovery, refresh, and server restarts preserve their expected
behavior. This app has its own accounts, separate from the other examples.

Supply `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` through the environment
or `.env`. `AUTH_EMAIL_FROM` defaults to `hello@effect-agent.com`.

- [password-methods.ts](src/password-methods.ts) replaces the library's
  `Passwords.planRegister` function while retaining its other methods.
- [methods-live.ts](src/methods-live.ts) supplies the application's `AccountMethods`
  service. Its sign-in implementation accepts username or email, charges shared
  attempt limits, verifies a password, and completes authentication through the
  library's session authority. Registration reuses the library's password planning.
- [hashing.ts](../shared/account/hashing.ts), [policy.ts](src/policy.ts), and
  [delivery.ts](../shared/account/delivery.ts) supply hashing functions, action authorization,
  and private email delivery through their public services.
- [live.ts](src/live.ts) assembles these Layers; [model.ts](src/model.ts) owns
  persisted schemas and incrementing identifiers.

Replacing one library method uses ordinary Layer composition:

```ts
const Passwords = AppAuth.strategies.password.Passwords;

const PasswordMethodsLive = Layer.effect(
  Passwords,
  Effect.gen(function* () {
    const defaults = yield* Passwords;
    return { ...defaults, planRegister: customPlanRegister(defaults.planRegister) };
  }),
).pipe(Layer.provide(AppAuth.strategies.password.layer));
```

`customPlanRegister` is application code; the complete implementation is in
[password-methods.ts](src/password-methods.ts). For a different payload or workflow,
[methods.ts](src/methods.ts) defines schema-backed operations with `Auth.makeStrategy`.
`AccountMethods` and `AccountStore` are application services, not library exports.

[store.ts](src/store.ts) serializes transactions into `.data/accounts.json` with an
exclusive writer lock, schema validation, fsync, and atomic rename. Preparation
failures discard the working copy and receipts. Expiry is checked again immediately
before publication. An uncertain write disables that store instance until reload;
request receipts, proof consumption, and delivery claims prevent unsafe replay.
Only digests and password verifiers are persisted, never codes or session bearers.

This store supports one process on a local filesystem. After a crash, remove
`.data/writer.lock` only after confirming the old process has stopped. Production
replication, backups, and storage limits belong to the application. The example
implements its declared account flows; additional password creation, address
replacement, and passkey removal are unexposed and fail closed.

[contract.ts](src/contract.ts) extends the [common account contract](../shared/account/contract.ts)
with username fields and two method bindings. [auth.ts](src/auth.ts) reuses the shared
strategies and session configuration. The other examples use the common `AuthApi`
and `AppAuth` directly.

Hashing, Cloudflare delivery, forms, and Atom workflows live in [shared/account](../shared/account).
[client.ts](src/client.ts) supplies the two username payload mappings.
Adding a passkey requires authentication from the last five minutes. Sign in again
when prompted; an older valid session still permits ordinary account reads.
