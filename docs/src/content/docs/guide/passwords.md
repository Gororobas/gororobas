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

<!-- prettier-ignore -->
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

Password registration does not prove ownership of the email address. Offer
[mailbox registration](./codes#register-a-mailbox-owner) with `Email.makeRegistration`
so the mailbox owner can complete signup when someone else reserved the address
without verifying it. This provisions a fresh account; it does not reset or inherit
the earlier account. Password-only compositions must add that registration endpoint
and its services explicitly.

## Handle a rejected sign-in

With `Effect` imported from `effect`, handle only the expected rejection:

<!-- prettier-ignore -->
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

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.changePassword({ commandId, currentPassword, newPassword });
```

This call requires an authenticated `Auth.AuthRequest`. Applications requiring
another factor also supply `actionProof`. The result reports the session
invalidation behavior of your selected strategy.

## Supply the services

Supply `PasswordHashing` explicitly. The maintained Argon2id adapter lives in
`@yielded/auth-crypto/Password`; its Layer also requires bounded KDF admission and
Web Crypto. Storage, claims, account creation, screening, and change authorization
remain application-owned:

```ts title="apps/server/password-live.ts"
import { Layer } from "effect";
import { Password, WebCrypto } from "@yielded/auth";
import * as PasswordCrypto from "@yielded/auth-crypto/Password";

import { AppAuth } from "./auth";
import { AuthDependencies } from "./auth-dependencies";
import { authorizePasswordChange, registerAccount, resolvePasswordClaims } from "./auth-accounts";
import { PasswordPersistenceLive, ProofPersistenceLive } from "./auth-persistence";
import { checkPassword } from "./password-screening";
import { EmailLive } from "./email";

export const PasswordLive = Layer.mergeAll(
  PasswordCrypto.layer().pipe(
    Layer.provide(Password.PasswordKdfAdmission.layer()),
    Layer.provide(WebCrypto.layerWebCrypto),
  ),
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

Share one `PasswordKdfAdmission.layer()` instance across hashers in each runtime.
By default it runs one KDF callback and accepts up to 16 waiting calls, each with a
5000ms acquisition deadline. A full queue or expired wait fails with
`PasswordKdfBusy`; interrupted waiters leave the queue. Once admitted to run, work
retains its permit through completion and cleanup, even if its caller is interrupted.
The deadline does not limit running KDF work.

Configure `concurrency`, `maxQueued`, and `maxWaitMilliseconds` on the Layer;
`maxQueued: 0` enables fail-fast admission. Size concurrency for your host's KDF
memory and CPU budget. These are process-local limits, without a strict FIFO
ordering guarantee; applications still need ingress rate limits.

Compromised-password screening fails closed. `PasswordPolicy.screeningTimeoutMillis`
defaults to 10,000 ms (allowed range: 1–30,000); a timed-out check returns
`PasswordCheckUnavailable`, so no password is registered or changed.

## Recover a password

Recovery uses `requestReset` → `verifyReset` → `completeReset` and requires an
independently verified email address. The definition above selects reset links.
Auth builds the link and renders the email; your `EmailDelivery` service only
sends the finished message. See [email delivery](./email-delivery) for REST API
and Alchemy examples.

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

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const requested = yield* auth.requestReset({ flowId, requestId, email, locale: "en" });
```

Retain the original flow ID, email, request ID, and reference. Always show a generic
response such as “If this address is eligible, check your email.” The receipt does
not reveal account eligibility or whether a message was sent.

To resend, retain the flow ID and use a fresh request ID after the cooldown.
A new reset attempt leaves an existing unexpired link or code usable and sends no
new email. Ignored requests do not extend its expiry (five minutes by default).

Auth supplies a network rate limiter, and HTTP derives the caller from the socket
peer automatically. Checks precede target lookup, including unknown addresses and
retries. See [HTTP admission](./http-and-client#proof-request-admission) for overrides and
[proof budgets](./codes#proof-expiry-and-rate-limits) for delivery limits.

For links, the originating client uses `EmailDelivery.parseLinkFragment` to extract
the reference and secret, clears the fragment from history, then waits for an
intentional confirmation before submitting. A landing-page GET must never consume
the proof. See [link handling](./email-delivery#handle-links) for the private-state
and response-header boundaries. For codes, use the saved reference and entered code.

In the next request, verify the submitted secret:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const verified = yield* auth.verifyReset({ flowId, email, reference, secret });
```

Retain `verified.continuation.continuationId`. Its matching credential is issued
through the private `proof-continuation` channel. Complete with the same flow and email:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.completeReset({
  flowId,
  email,
  commandId,
  newPassword,
  continuationId,
  credential,
});
```

These are server-side inputs. For browser endpoints, map `credential` to the
`proof-continuation` slot through the contract's `requestFields`, so the HTTP adapter
reads the private cookie. Never return secrets in ordinary operation results or logs,
or make the browser copy an HttpOnly cookie into JSON. Generate `commandId` once per
completion submission. Completion changes the password; sign in separately for a session.

### Delivery and retry boundaries

Auth's built-in worker admits delivery after the proof commits, so public requests
do not wait for provider acceptance. No scheduler setup is needed; build Auth in an
application scope that outlives requests, as shown in [email delivery](./email-delivery#compose-auth).
Work may start before the response is sent. Application hooks and persistence can
still vary in latency.

Provider acceptance does not prove inbox delivery.
The transport distinguishes definite rejection from uncertain acceptance. Neither
Auth nor the transport should automatically resend an uncertain message; this email
service makes no deduplication promise and requires `maximumDeliveryAttempts: 1`.

An exact `requestReset` retry can recover a generic receipt, not guarantee another
send. Scheduled dispatch is a process-local continuation after persistence commits, not a
durable outbox. A crash can leave an unsent proof. Let the user check their inbox
and, if needed, explicitly start a new flow under the configured cooldown and attempt
limits. A consumed proof or an unknown commit outcome does not authorize repeating
a password mutation.

See the [complete password composition](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/password-methods.ts)
for a reset-link journey using a private local email collector.
