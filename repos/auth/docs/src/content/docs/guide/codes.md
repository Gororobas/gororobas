---
title: Email codes and magic links
description: Send email codes, verify them, and finish sign-in.
---

Email sign-in is a short flow: bind the request, send a proof, verify it, then
complete sign-in.

This guide shows local service calls inside existing Effect request handlers.
Provide `AppAuth` and the HTTP request boundary. For browser access, declare the
actions in a [shared contract](./http-and-client#expose-another-method).

## Enable email codes

```ts title="apps/server/auth.ts"
import { Schema } from "effect";
import { Auth, Email, Sessions } from "@yielded/auth";

export const AppAuth = Auth.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  sessions: Sessions.stateful(),
  strategies: {
    email: Email.makeCode(),
  },
  defaultStrategy: "email",
});
```

Codes default to six digits and five minutes. Override `digits` or `policy` when
needed. Supply shared `ProofKeys` through [AuthDependencies](../reference/adapters#compose-the-application-layer).

## Start the flow and send a code

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const started = yield* auth.beginSignIn({ flowId });
```

The next request sends the code:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const sent = yield* auth.signIn({
  flowId,
  requestId,
  requestBinding,
  email,
  returnTarget: "/account",
  locale: "en",
});
```

`beginSignIn` delivers a private request-binding credential. The next request uses
that credential as `requestBinding`. `signIn` returns a proof `reference`, not the code.
Auth renders the email; your `EmailDelivery` service sends the finished message.

`requestBinding` and the continuation `credential` below are private server inputs.
Map them to the `request-binding` and `proof-continuation` slots through the
contract's `requestFields`. The resulting named server and client methods omit
those fields; never make the browser read an HttpOnly cookie or send it as JSON.

## Verify the code

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const verified = yield* auth.verifySignIn({
  flowId,
  requestBinding,
  email,
  reference,
  secret: code,
  returnTarget: "/account",
});
```

Keep `verified.continuation.continuationId`. Its matching credential is
privately delivered to the originating client.

## Complete sign-in

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.completeSignIn({
  flowId,
  requestBinding,
  email,
  continuationId,
  credential,
  returnTarget: "/account",
});
```

Check `result.completion._tag` before granting access. Only `Authenticated`
contains a session. The [HTTP adapter](./http-and-client) maps private credentials
to cookies so they stay out of ordinary browser payloads.

## Use a magic link instead

```ts title="apps/server/magic-link.ts"
import { Email } from "@yielded/auth";

export const magicLink = Email.makeLink({ url: "https://app.example.com/sign-in" });
```

Use this strategy with the same begin → request → verify → complete flow.
Auth places the reference and secret in the URL fragment. Use
`EmailDelivery.parseLinkFragment` to read it. A landing-page GET
must not consume it: show a confirmation action, clear the fragment from browser
history, and complete from the originating client.

<details id="proof-expiry-and-rate-limits">
<summary>Proof expiry and rate limits</summary>

```ts title="apps/server/proof-policy.ts"
import { type Proofs } from "@yielded/auth";

export const proofPolicy: Proofs.ProofPolicy = {
  lifetimeMillis: 5 * 60_000,
  continuationLifetimeMillis: 30_000,
  maximumFailedAttempts: 5,
  maximumDeliveryAttempts: 1,
  deliveryClaimMillis: 10_000,
  deliveryRetryMillis: 30_000,
  requestRetentionMillis: 60 * 60_000,
  abuse: {
    issues: { limit: 5, windowMillis: 60 * 60_000 },
    attempts: { limit: 10, windowMillis: 5 * 60_000 },
    subjectIssues: { limit: 5, windowMillis: 60 * 60_000 },
    subjectAttempts: { limit: 10, windowMillis: 5 * 60_000 },
    actionIssues: { limit: 1000, windowMillis: 60 * 60_000 },
    actionAttempts: { limit: 1000, windowMillis: 5 * 60_000 },
    resendCooldownMillis: 30_000,
  },
};
```

Size `actionIssues` for peak accepted deliveries across the whole deployment; it
is a shared circuit breaker, not a per-client allowance. The values above are an
example policy. Only newly issued proofs spend issuance budgets; suppressed,
ineligible, and replayed requests still pass host ingress admission. Attempts keep
their independent budgets across resends and flow IDs.

A live, unexpired proof can be replaced only with the same complete request
binding. Knowing its public reference does not grant replacement authority.
A different flow may need to wait for expiry; host ingress limits unsolicited
requests but cannot guarantee availability against distributed traffic.

</details>

## Supply the services

Your application supplies lookup, claims, storage, and delivery. Auth provides
request rate limiting, a delivery worker, an exact-route allowlist helper,
Web Crypto, and empty lifecycle hooks:

```ts title="apps/server/email-live.ts"
import { Layer } from "effect";
import { Email } from "@yielded/auth";

import { AppAuth } from "./auth";
import { AuthDependencies } from "./auth-dependencies";
import { lookupEmail, resolveEmailClaims } from "./auth-accounts";
import { ProofPersistenceLive } from "./auth-persistence";
import { EmailLive } from "./email";

export const EmailServicesLive = Layer.mergeAll(
  ProofPersistenceLive,
  Layer.succeed(Email.EmailSignInTargets, { lookup: lookupEmail }),
  Layer.succeed(AppAuth.strategies.email.SessionClaims, { resolve: resolveEmailClaims }),
  Email.EmailReturnTargets.exactRoutes(["/account"]),
  EmailLive,
);

export const AuthLive = AppAuth.layer.pipe(
  Layer.provide(EmailServicesLive),
  Layer.provide(AuthDependencies),
);
```

The relative imports are your application modules. `EmailLive` implements the
email service. Auth's built-in worker keeps provider acceptance outside the request's
wait for a response; build Auth in an application scope that outlives requests.
See [email delivery](./email-delivery#compose-auth) for runtime ownership and overrides.
`AuthDependencies` supplies the shared
[session, account, and key configuration](../reference/adapters#compose-the-application-layer).
For database-backed lookup, use [the email adapter](../reference/adapters#email).

Email requests and resends check the built-in rate limiter before target lookup,
including exact retries and unknown addresses. HTTP derives the caller from the
socket peer automatically. See [HTTP admission](./http-and-client#proof-request-admission)
for configuration and overrides.

## Register a mailbox owner

Compose `Email.makeRegistration({ namespace, registration: Registration })` with
`Email.makeCode({ namespace })` using the same namespace. A guest calls
`beginRegistration` → `register` → `verifyRegistration` → `completeRegistration`.
The [shared login contract](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-contract.ts)
exposes these existing operations with private request-binding and continuation
cookies; the [server composition](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-server.ts)
supplies both strategies.

Provide the registration strategy's `RegistrationAuthority` with
`makeEmailRegistrationServices` from your Drizzle adapter, and provide
`ProofPersistence` through `makeProofPersistenceServices` with the same proof mapping
for issuance and completion. In atomic mode, completed
mailbox proof can replace another subject's active, unverified email reservation
when the application's inspection and proof policies allow it. The new account
receives the verified address. The earlier account keeps its data and credentials,
and its security revision advances. Verified ownership is never replaced.

Registration does not issue a session. Start a fresh email sign-in afterward;
an authenticated user can then call `addPassword` when password management is
enabled. `AuthPersistence.layer` does not install guest email-registration services
automatically. Pending-mode registration leaves provisioning and ownership changes
to the application. See [email persistence](../reference/adapters#email) for mapping
and session invalidation requirements.

Use `Email.makeAddresses` for authenticated address management. Confirming an
address there does not create or link an account.

See the [combined login example](./oauth#other-providers)
to share Auth, sessions, and client methods with GitHub.
