---
title: Apple
description: Set up Sign in with Apple using the shared OIDC flow.
---

`Apple.provider` adds Sign in with Apple to an [OAuth strategy](./oauth).
It verifies an ID token and establishes your application's session. The preset
does not retain Apple API access.

## Configure your Apple service

In [Apple Developer](https://developer.apple.com/account/resources/identifiers/list),
create a Services ID, enable Sign in with Apple, and register your exact HTTPS
callback, `https://app.example.com/auth/apple/callback`. Create a Sign in with
Apple key, download the `.p8` file, and note its Key ID. The Team ID is on the
developer account membership page. The client ID is the Services ID.
See Apple's [web setup](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms)
and [client secret](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret)
guides.

Load the credentials while building the server Layer:

```ts title="apps/server/apple.ts"
import { Config, Effect, Layer } from "effect";
import { Apple, Http } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          apple: Apple.provider({
            clientId: yield* Config.String("APPLE_CLIENT_ID"),
            teamId: yield* Config.String("APPLE_TEAM_ID"),
            keyId: yield* Config.String("APPLE_KEY_ID"),
            privateKey: yield* Config.Redacted("APPLE_PRIVATE_KEY"),
            scopes: ["openid", "email", "name"],
          }),
        },
      },
    });
  }),
);
```

`APPLE_PRIVATE_KEY` is the `.p8` PEM, including headers, or the raw base64 PKCS8
body. [Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`openid`; request `email` and `name` only when your application needs them.
Start with `auth.signIn({ provider: "apple", returnTarget: "/account" })` and
redirect to the returned authorization URL. The callback completes sign-in.

The preset mints an ES256 client-secret JWT from the `.p8` key through
`@yielded/jose` on each token request. Lifetime defaults to five minutes and
cannot exceed six months. `Apple.mintClientSecret` exposes the same minting for
hosts that need the JWT outside the preset.

## Identity and name

The durable identity is `(provider key, "https://appleid.apple.com", verified sub)`.
Keep `sub` unchanged; the email address does not identify a local account. Never
link accounts merely because profile emails match, even when `email_verified` is
true. Hide My Email addresses set `is_private_email`.

The preset carries `AppleUserProfile` through ID-token projection. Apple sends
`email_verified` and `is_private_email` as booleans or the strings `"true"` and
`"false"`; the schema decodes both to booleans. Declare the same schema on the strategy to
get typed `providerData` in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { apple: Apple.AppleUserProfile } });
```

Name is not in the ID token. On first consent Apple POSTs a `user` form field
with `name.firstName` and `name.lastName`. The adapter merges those into the
profile once. A combined name longer than 256 characters is omitted; `given_name`
and `family_name` are still kept. Later sign-ins omit the field; persist the name
in your own storage if you need it again.

## Callbacks

Apple requires `response_mode=form_post` when `name` or `email` is requested.
The preset always uses form_post. The HTTP adapter accepts `application/x-www-form-urlencoded`
POSTs on the same callback path as query callbacks. That sign-in sets the
request-binding cookie to `SameSite=None; Secure` so the browser sends it on
Apple's cross-site POST. The callback still requires the cookie and checks it
against the flow before exchanging the code. Other auth cookies stay `SameSite=Lax`.
Account linking and connected-account completion recover the caller from the
continuation sealed at the authenticated begin, then still require that subject
and the binding. Query callbacks still require the live session. HTTPS is
required, because `SameSite=None` is invalid without `Secure`.

## Run the example

The [Apple application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/apple-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Apple subject and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/apple/callback` URL on the Services ID.
2. Set `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   `APPLE_PRIVATE_KEY` (PEM or raw PKCS8 base64), and `APPLE_USER_ID` (the stable
   `sub` from a prior ID token).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:apple` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Apple ID.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/apple-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin. This resets this example's
account link and flows. No provider grant is retained, so `OAUTH_TOKEN_KEY` is
not needed.

## Protocol profile

The preset uses Apple's [discovery document](https://appleid.apple.com/.well-known/openid-configuration)
with these constraints:

| Concern                  | Behavior                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Issuer                   | Exact `https://appleid.apple.com`                                                        |
| Authorization / callback | `/auth/authorize`, authorization code, form_post response                                |
| Token exchange           | `/auth/token`, `client_secret_post` with a minted ES256 JWT                              |
| Signature                | Advertised RS256, keys at `/auth/keys`; issuer, audience, expiry and nonce verified      |
| PKCE                     | Not advertised; the preset sets `pkceS256: false`                                        |
| Response issuer          | Apple does not advertise RFC 9207 `iss`; use a distinct callback URL                     |
| Access                   | Sign-in only; no retained access, refresh, revocation or UserInfo support in this preset |

The preset pins Apple's issuer and endpoints. Explicit metadata that changes those
values fails configuration. Unexpected callback `iss` values are rejected; the
signed ID token must still have Apple's exact issuer.

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
