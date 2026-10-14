---
title: Email codes and magic links
description: Send an email code and redeem it to sign in.
---

Email sign-in has three steps: bind the request, send a proof, then submit its
reference and secret to complete sign-in.

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

```ts
const auth = yield* AppAuth;
const started = yield* auth.beginSignIn({ flowId });
```

The next request sends the code:

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

`requestBinding` is a private server input. Map it to the `request-binding` slot
through the contract's `requestFields`; named client methods then omit it.
Never make the browser read an HttpOnly cookie or send it as JSON.

## Complete sign-in

```ts
const auth = yield* AppAuth;
const result = yield* auth.completeSignIn({
  flowId,
  requestBinding,
  email,
  reference,
  secret: code,
  returnTarget: "/account",
});
```

Check `result.completion._tag` before granting access. Only `Authenticated`
contains a session. The proof is consumed before independent session issuance; if
issuance fails or its outcome is unknown, start a new flow. The [HTTP adapter](./http-and-client) maps private credentials
to cookies so they stay out of ordinary browser payloads.

## Use a magic link instead

```ts title="apps/server/magic-link.ts"
import { Email } from "@yielded/auth";

export const magicLink = Email.makeLink({ url: "https://app.example.com/sign-in" });
```

Use this strategy with the same begin → request → complete flow.
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
  maximumFailedAttempts: 5,
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

Pass this policy to `Email.makeCode({ policy: proofPolicy })`. Keep
`resendCooldownMillis` shorter than the proof lifetime. Rate limits apply to
repeated requests and unknown addresses too. The default limiter is process-local;
[share identifier and subject limits](./passwords#share-rate-limits) across
replicas or per-request runtimes. Action budgets remain per instance.

To resend, keep the original flow and private request binding, then request a new
code after the cooldown. A different binding cannot replace an unexpired proof,
even with its public reference. `requestId` is correlation only; it does not
recover an earlier receipt or delivery.

</details>

## Supply the services

Your application supplies lookup, claims, storage, delivery, and
[crypto Layers](../reference/crypto#use-with-auth). The return-target allowlist
restricts where sign-in can send the user:

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

For sibling apps, configure [cross-origin return targets](./http-and-client#sharing-sessions-across-apps).

The relative imports are your application modules. `EmailLive` implements
[email delivery](./email-delivery); build Auth in a scope that outlives requests
so its delivery worker can finish. `AuthDependencies` supplies shared
[session, account, and key configuration](../reference/adapters#compose-the-application-layer).
For database-backed lookup, use [the email adapter](../reference/adapters#email).

HTTP derives the network key for request admission from the socket peer. See
[HTTP admission](./http-and-client#proof-request-admission) for proxy configuration
and overrides.

## Register a mailbox owner

Compose `Email.makeRegistration({ namespace, registration: Registration })` with
`Email.makeCode({ namespace })` using the same namespace. A guest calls
`beginRegistration` → `register` → `completeRegistration`. The
[login contract](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-contract.ts)
and [server](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-server.ts)
show both strategies and their private request-binding cookie.

Provide `RegistrationAuthority` with your Drizzle adapter's
`makeEmailRegistrationServices`, plus `makeProofPersistenceServices` using the
same proof mapping for issuance and redemption. `AuthPersistence.layer` does not
install guest email-registration services automatically. Provisioning is
synchronous and must be idempotent by the authority's stable `requestId`.

When your policy allows it, mailbox proof can reclaim an unverified email
reservation for a new account. It never transfers the earlier account's data or
credentials, or replaces verified ownership. See
[email persistence](../reference/adapters#email) for mapping and invalidation requirements.

Registration does not issue a session. Start a fresh email sign-in afterward;
an authenticated user can then call `addPassword` when password management is enabled.

Use `Email.makeAddresses` for authenticated address management. Confirming an
address there does not create or link an account.

See the [combined login example](./oauth#other-providers)
to share Auth, sessions, and client methods with GitHub.
