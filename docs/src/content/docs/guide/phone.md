---
title: Phone codes
description: Request an SMS code and sign in with a phone number.
---

Use `PhoneOtp` to sign in existing accounts with an SMS code.

For managed or application-declared SQL storage, the [composed persistence Layer](../reference/adapters#compose-persistence-once)
supplies phone and proof services together. The explicit mappings below also cover
number lifecycle operations and specialized storage layouts.

The snippets below are local calls inside existing Effect request handlers, with
`AppAuth` and the HTTP request boundary provided. Publish selected methods through
a [shared contract](./http-and-client#expose-another-method) for browser clients.

## Enable phone sign-in

```ts title="apps/server/auth.ts"
import { Schema } from "effect";
import { Auth, PhoneOtp, Sessions } from "@yielded/auth";

export const AppAuth = Auth.make("app/Auth", {
  claims: Schema.Struct({ phoneNumber: PhoneOtp.PhoneNumber }),
  sessions: Sessions.stateful(),
  strategies: {
    phone: PhoneOtp.make(),
  },
  defaultStrategy: "phone",
});
```

The default code has six digits and expires after five minutes. Override `digits`
or `policy` only to change that behavior. Keys and delivery come from Layers.

## Send a code

With `Effect` imported from `effect`, supply the request's host-verified network key:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const started = yield* auth.signIn({ phoneNumber, locale: "en" }).pipe(
  Effect.provideService(PhoneOtp.PhoneRequestContext, { networkKey }),
);
```

`networkKey` is a `Redacted<string>` used for admission limits. Derive it on the
server per request; the HTTP auth adapter does not supply it.
Use an international number such as `+14155550123`. The result contains a `flowId`
and proof `reference`. The request binder goes through private credential delivery;
your SMS service receives the code.

## Complete sign-in

Use the original `flowId` and `reference`. The server resolves `requestBinding`
from private request credentials. In a shared action, map it with
`requestFields: { requestBinding: "request-binding" }`; the named server and client
calls then take only the public fields.

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.completeSignIn({
  flowId,
  phoneNumber,
  requestBinding,
  reference,
  code,
}).pipe(
  Effect.provideService(PhoneOtp.PhoneRequestContext, { networkKey }),
);
```

```text
signIn({ phoneNumber })
  → SMS + private request binder
  → user enters code
  → completeSignIn(original flow, binder, reference, code)
  → session or additional-factor result
```

A consumed code cannot be reused if session issuance subsequently fails. Request
a new code. SMS proves possession; it does not provide phishing resistance.

## Supply the services

The strategy handles code generation and verification. Supply these implementations:

| Layer or service           | What it does                                                        | Where it comes from                           |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `PhonePersistenceLive`     | Finds the account for a phone number and enforces admission limits. | Your database, using a library adapter below. |
| `ProofPersistenceLive`     | Stores code digests, expiry, failed attempts, and consumption.      | Your database, using a library adapter below. |
| `PhoneDeliveryEligibility` | Decides which destination numbers you support.                      | Your application policy.                      |
| `SessionClaims`            | Returns the session fields declared in `AppAuth.claims`.            | Your application.                             |
| `SmsDelivery`              | Sends the message.                                                  | `Twilio.layer` or another transport.          |

`PhonePersistenceLive` and `ProofPersistenceLive` are names for the Layers you build
below, not package exports. The adapters implement the storage operations; you
supply your table mappings and migrations.

<details>
<summary>Build the database Layers — SQLite on Bun</summary>

<!--@include: ../reference/adapters.md#phone-layers-->

</details>

Wire those Layers with a sending policy and session claims:

```ts title="apps/server/phone-live.ts"
import { Config, Effect, Layer } from "effect";
import { PhoneOtp } from "@yielded/auth";
import * as Twilio from "@yielded/auth/adapters/Twilio";
import { FetchHttpClient } from "effect/http";

import { AppAuth } from "./auth";
import { AuthDependencies } from "./auth-dependencies";
import { PhonePersistenceLive, ProofPersistenceLive } from "./auth-persistence";

const TwilioConfigLive = Layer.effect(
  Twilio.TwilioConfig,
  Config.all({
    accountSid: Config.String("TWILIO_ACCOUNT_SID"),
    authToken: Config.Redacted("TWILIO_AUTH_TOKEN"),
    from: Config.String("TWILIO_FROM"),
  }),
);

const SmsLive = Twilio.layer.pipe(
  Layer.provide(TwilioConfigLive),
  Layer.provide(FetchHttpClient.layer),
);

export const PhoneLive = Layer.mergeAll(
  PhonePersistenceLive,
  ProofPersistenceLive,
  Layer.succeed(PhoneOtp.PhoneDeliveryEligibility, {
    allowed: (number) => Effect.succeed(number.startsWith("+1")),
  }),
  Layer.succeed(AppAuth.strategies.phone.SessionClaims, {
    resolve: ({ credential }) => Effect.succeed({ phoneNumber: credential.phoneNumber }),
  }),
  SmsLive,
);

export const AuthLive = AppAuth.layer.pipe(
  Layer.provide(PhoneLive),
  Layer.provide(AuthDependencies),
);
```

This example allows `+1` destinations and stores the **verified** phone number
in the session. Replace the prefix check with your supported destinations. To add
account fields to claims, accept `resolve: ({ subjectId }) => …` and query your account by that ID and return the fields declared in `AppAuth.claims`.

`TwilioConfigLive` loads credentials from Effect Config; use `messagingServiceSid`
instead of `from` for a Twilio Messaging Service. The adapter uses Effect HTTP and
requires no Twilio SDK.

`AuthDependencies` is defined in the [shared application composition](../reference/adapters#compose-the-application-layer).
It supplies session storage, account authority, request-binding configuration, and
`ProofKeys`. Web Crypto, empty lifecycle hooks, and a bounded delivery worker have
defaults. Database storage, destination policy, claims, and delivery have no automatic
implementations. Build Auth in an application scope that outlives requests; the built-in
worker keeps SMS provider latency outside the response path without extra wiring.
See [delivery lifetime and overrides](./email-delivery#compose-auth), which also apply to SMS.

<details>
<summary>Customize the SMS message</summary>

Add this optional Layer to `PhoneLive`:

```ts
PhoneOtp.Template.layer({
  render: (code) => `Your Acme sign-in code is ${code}.`,
});
```

The default is `Your sign-in code is 123456.` The renderer also receives locale
and expiry as its second argument. Text stays private through delivery.

</details>

<details>
<summary>Register or change phone numbers</summary>

Enable lifecycle operations on the same strategy:

```ts
phone: PhoneOtp.make({ lifecycle: true });
```

Use a lifecycle policy object instead of `true` to customize its behavior.

These operations additionally require `PhonePersistence` and `PhoneActionEvidence`.
The Drizzle Layer above already supplies `PhonePersistence`. Add independent
authorization to `PhoneLive`:

```ts
Layer.succeed(PhoneOtp.PhoneActionEvidence, { verify: authorizePhoneChange });
```

`authorizePhoneChange` is your application's check of independent evidence for
a number change. Start with `auth.begin(input)` and finish with
`auth.completeLifecycle(input)`. Supply `PhoneRequestContext`
for each request, as for sign-in.

Do not link accounts because their phone strings match. See the
[complete phone composition](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/phone-sqlite-bun.ts).

</details>
