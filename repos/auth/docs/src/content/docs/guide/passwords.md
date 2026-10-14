---
title: Passwords
description: Register accounts, sign in, and change passwords.
---

Use `Password.make()` for existing-account sign-in. Configure registration and
recovery to enable full password management.

## Enable passwords

```ts title="apps/server/auth.ts"
import { Schema } from "effect";
import { Auth, Password, Sessions } from "@yielded/auth";

export const AppAuth = Auth.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  sessions: Sessions.stateful(),
  strategies: {
    password: Password.make({
      registration: Schema.Struct({ displayName: Schema.NonEmptyString }),
      reset: Password.resetLink({ url: "https://app.example.com/reset-password" }),
    }),
  },
  defaultStrategy: "password",
});
```

Password policy and proof expiry have defaults. Choose reset links or codes explicitly.
Your application controls account creation and supplies an email transport. For sign-in only, use
`password: Password.make()` as in [getting started](./getting-started).

This definition exposes local methods. The calls below belong inside an existing
Effect request handler, with `AppAuth` provided and the HTTP request boundary in
place. To expose methods to a browser, declare them in the
[shared contract](./http-and-client#define-the-routes); enabling registration or
reset support does not automatically publish those endpoints.

## Register an account

```ts
const auth = yield* AppAuth;
const result = yield* auth.register({
  requestId,
  email,
  newPassword,
  registration: { displayName },
});
```

Generate `requestId` once per submission and retain it for an exact retry.
`RegistrationAccepted` does not reveal whether the account already existed.
Provisioning completes synchronously. If accounts live in another system, provision
idempotently by `requestId` or run an application-owned queue before registration.

Password registration does not prove ownership of the email address. Offer
[mailbox registration](./codes#register-a-mailbox-owner) with `Email.makeRegistration`
so the mailbox owner can complete signup when someone else reserved the address
without verifying it. This provisions a fresh account; it does not reset or inherit
the earlier account. Password-only compositions must add that registration endpoint
and its services explicitly.

## Handle a rejected sign-in

With `Effect` imported from `effect`, handle only the expected rejection:

```ts
const auth = yield* AppAuth;
const result = yield* auth.signIn({ email, password }).pipe(
  Effect.catchTag("PasswordRejected", () =>
    Effect.succeed({ _tag: "InvalidCredentials" as const }),
  ),
);
```

Use the same message for a missing account and a wrong password. Storage and
hashing failures remain errors; do not turn them into successful sign-ins.
An `Authenticated` result carries the session; an additional-factor result
must be completed before granting access.

## Change a password

```ts
const auth = yield* AppAuth;
const result = yield* auth.changePassword({ commandId, currentPassword, newPassword });
```

This call requires an authenticated `Auth.AuthRequest` and approval from your
`PasswordActionEvidence` service. Your policy can require `actionProof` or accept
recent passkey authentication instead of `currentPassword`. Use
`sessions.inspectInvocation` to check the private factor evidence and its age;
public session assurance alone is not authorization. The
[example policy](https://github.com/yielded-dev/auth/blob/main/examples/shared/account/password-authorization.ts)
shows that check.

The result reports session invalidation. When your policy accepts recent passkey
authentication, omit `currentPassword`:

```ts
const result = yield* auth.changePassword({ commandId, newPassword });
```

## Supply the services

On Cloudflare Workers, provide [`WorkerdServices.layer`](../reference/crypto#use-with-auth)
once to the application Layer. It includes password hashing and its runtime dependencies.
Storage, claims, account creation, screening, and change authorization remain application-owned.

For manual composition on other runtimes, supply `Password.PasswordHashing.layer()`
with a crypto backend, bounded KDF admission, and Effect Crypto for entropy:

```ts title="apps/server/password-live.ts"
import { Layer } from "effect";
import { Password } from "@yielded/auth";

import { AppAuth } from "./auth";
import { CryptoLive } from "./crypto-live";
import { AuthDependencies } from "./auth-dependencies";
import { authorizePasswordChange, registerAccount, resolvePasswordClaims } from "./auth-accounts";
import { PasswordPersistenceLive, ProofPersistenceLive } from "./auth-persistence";
import { checkPassword } from "./password-screening";
import { EmailLive } from "./email";

export const PasswordLive = Layer.mergeAll(
  Password.PasswordHashing.layer().pipe(Layer.provide(CryptoLive)),
  PasswordPersistenceLive,
  ProofPersistenceLive,
  Layer.succeed(AppAuth.strategies.password.SessionClaims, { resolve: resolvePasswordClaims }),
  Layer.succeed(AppAuth.strategies.password.RegistrationAuthority, { register: registerAccount }),
  Layer.succeed(Password.CompromisedPasswords, { check: checkPassword }),
  Layer.succeed(Password.PasswordActionEvidence, { verify: authorizePasswordChange }),
  EmailLive,
);

export const AuthLive = AppAuth.layer.pipe(
  Layer.provide(PasswordLive),
  Layer.provide(AuthDependencies),
);
```

The relative imports are your application modules; [Drizzle adapters](../reference/adapters#passwords)
can provide persistence and registration. `AuthDependencies` supplies the shared
[session, account, and key configuration](../reference/adapters#compose-the-application-layer).
For sign-in-only `Password.make()`, supply hashing, password persistence, and claims
alongside those shared services. Keep normalization stable for stored credentials.

[`CryptoLive`](../reference/crypto#use-with-auth) selects your crypto backend.
Share one `KdfAdmission.layer()` from `@yielded/crypto/KdfAdmission` across backends
and password hashers in each runtime. Size it for the host's memory and CPU budget;
queue exhaustion or an expired wait returns `PasswordKdfBusy`. See
[KDF resource limits](../reference/crypto#backends-and-resource-limits) for options.

`PasswordHashing.layer()` and `WorkerdServices.layer` default to Argon2id.
Workers requires `nodejs_compat`; Wrangler includes the bundled Wasm without a
compiler or separate asset hosting.

To select native scrypt on Node, Bun, or Workers:

```ts
Password.PasswordHashing.layer(Password.defaultScryptPasswordHashingConfig).pipe(
  Layer.provide(CryptoLive),
);
```

With the Workers bundle, use
`WorkerdServices.layerWith({ passwordHashing: Password.defaultScryptPasswordHashingConfig })` instead.

The default scrypt configuration uses `N=16384`, `r=8`, `p=5`, the
[OWASP 16 MiB profile](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
Custom configurations support costs 8192, 16384, and 32768 with `r=8` and at least
10, 5, and 3 parallelization steps respectively. Successful sign-in can rehash a
credential to the selected policy, so keep a backend capable of verifying stored
hashes. PBKDF2 verification requires the host to accept the stored iteration count;
see [runtime limits](../reference/crypto#compose-a-backend).

`Password.PasswordAttemptLimiter` separately limits sign-in attempts. Store
failures deny the request, and rejected attempts still count. Compromised-password
screening also fails closed: its default ten-second timeout returns
`PasswordCheckUnavailable` without registering or changing a password.

### Share rate limits

Default limiters are process-local and reset on restart. Their stores are bounded
to 10,000 keys; reaching capacity can reject requests for valid accounts too.
Multiple replicas, or a runtime rebuilt per request, need a shared Effect limiter
or store for identifier, subject, and network limits. Action, global message, and
passkey module budgets remain per instance.

See [rate limiting](./rate-limits) for overrides, an Alchemy recipe using
Cloudflare's native binding, and the `KeyValueStore` and Redis alternatives.

## Recover a password

Recovery uses `requestReset` → `completeReset` and requires an
independently verified email address. Users who have a passkey sign in with it,
complete step-up if required, then change their password. The definition above selects reset links.
Auth builds the link and renders the email; your `EmailDelivery` service only
sends the finished message. See [email delivery](./email-delivery) for transport
setup and runtime ownership.

The link destination must be a fixed HTTPS URL without credentials, query, or
fragment. Auth validates it when building the Layer, before issuing any proof.
For a code-entry UI, select numeric codes instead:

```ts
Password.make({
  registration: Schema.Struct({ displayName: Schema.NonEmptyString }),
  reset: Password.resetCode(),
});
```

Codes default to six digits and also require `Proofs.ProofKeys.layer(proofKeys)` in
[`AuthDependencies`](../reference/adapters#compose-the-application-layer). Keep
leading zeroes by treating codes as strings. Link proofs do not require that keyring.
Both choices have working default email content; wording and localization can be
customized independently of the transport.

Start recovery inside an Effect request handler:

```ts
const auth = yield* AppAuth;
const requested = yield* auth.requestReset({ flowId, requestId, email, locale: "en" });
```

Retain the original flow ID, email, request ID, and reference. Always show a generic
response such as “If this address is eligible, check your email.” The receipt does
not reveal account eligibility or whether a message was sent.

To resend, retain the flow ID and use a fresh request ID after the cooldown.
A request with that same complete binding replaces the previous code when the
cooldown permits it. Another binding cannot replace an unexpired code. Suppressed
requests do not extend its expiry (five minutes by default).

Auth supplies a network rate limiter, and HTTP derives the caller from the socket
peer automatically. Checks precede target lookup, including unknown addresses and
retries. See [HTTP admission](./http-and-client#proof-request-admission) for overrides and
[proof budgets](./codes#proof-expiry-and-rate-limits) for delivery limits.

For links, the originating client uses `EmailDelivery.parseLinkFragment` to extract
the reference and secret, clears the fragment from history, then waits for an
intentional confirmation before submitting. A landing-page GET must never consume
the proof. See [link handling](./email-delivery#handle-links) for the private-state
and response-header boundaries. For codes, use the saved reference and entered code.

Submit the reference, secret, and replacement together:

```ts
const auth = yield* AppAuth;
const result = yield* auth.completeReset({
  flowId,
  email,
  commandId,
  newPassword,
  reference,
  secret,
});
```

Generate `commandId` once per submission. Reset consumes the proof and replaces
the password atomically, subject to your current action policy. It does not bypass
required factors or issue a session; sign in separately after completion.

### Delivery and retry boundaries

Build Auth in a scope that outlives requests so queued email can finish; see
[email delivery](./email-delivery#compose-auth). Delivery has no automatic retry or
durable outbox. If a message is lost, explicitly request a new proof after cooldown
with the original flow binding. The request ID is correlation only, not a delivery
recovery key. A consumed proof or unknown mutation outcome does not authorize
repeating a password change.

See the [complete password composition](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/password-methods.ts)
for a reset-link journey using a private local email collector.
