---
title: LINE
description: Set up LINE Login using the shared OIDC flow.
---

`Line.provider` adds LINE Login to an [OAuth strategy](./oauth).
It verifies an HS256 ID token with the channel secret and establishes your
application's session. The preset does not retain LINE Messaging API access.

## Configure your LINE channel

Create a LINE Login channel in the
[LINE Developers Console](https://developers.line.biz/console/).
Register your exact HTTPS callback, `https://app.example.com/auth/line/callback`.
Enable OpenID Connect. Turn on email under OpenID Connect if your application
needs it. The channel ID is the client ID; the channel secret is the client
secret. See [LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/).

Load the credentials while building the server Layer:

```ts title="apps/server/line.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Line } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          line: Line.provider({
            clientId: yield* Config.String("LINE_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("LINE_CLIENT_SECRET"),
            scopes: ["openid", "profile", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`openid`; request `profile` and `email` only when your application needs them.
Start with `auth.signIn({ provider: "line", returnTarget: "/account" })` and
redirect to the returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://access.line.me", verified sub)`.
LINE `sub` is the user ID for that LINE provider. Channels of the same provider
share it. Keep `sub` unchanged; neither the display name nor the email address
identifies a local account. Never link accounts merely because profile emails
match.

The preset carries `LineUserProfile` through ID-token projection. Declare the
same schema on the strategy to get typed `providerData` in
`SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { line: Line.LineUserProfile } });
```

The schema contains standard OIDC profile fields and the optional `amr`
authentication-method list from the verified ID token. Fields absent from that
token stay absent; no UserInfo request is made.

## Run the example

The [LINE application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/line-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured LINE user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/line/callback` URL in the LINE channel.
2. Set `LINE_CLIENT_ID`, `LINE_CLIENT_SECRET`, and `LINE_USER_ID` (the LINE user
   ID used as the expected `sub`).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:line` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured LINE account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/line-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin. This resets this example's
account link and flows. No provider grant is retained, so `OAUTH_TOKEN_KEY` is
not needed.

## Protocol profile

The preset uses LINE's [discovery document](https://access.line.me/.well-known/openid-configuration)
with these constraints:

| Concern                  | Behavior                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Issuer                   | Exact `https://access.line.me`                                                                  |
| Authorization / callback | `/oauth2/v2.1/authorize`, authorization code, query response                                    |
| Token exchange           | `https://api.line.me/oauth2/v2.1/token`, `client_secret_basic`                                  |
| Signature                | Documented web-login HS256 with the channel secret; issuer, audience, expiry and nonce verified |
| PKCE                     | S256 challenge and captured verifier on every exchange                                          |
| Response issuer          | LINE does not advertise RFC 9207 `iss`; use a distinct callback URL                             |
| Access                   | Sign-in only; no retained access, refresh, revocation or UserInfo support in this preset        |

LINE's web authorization-code flow signs ID tokens with HS256 and the channel
secret. Discovery currently lists only ES256, which LINE documents for native,
LINE SDK, and LIFF tokens. This preset verifies the web tokens the example
issues. The channel secret must be at least 32 bytes, matching JOSE HS256
import rules.

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
