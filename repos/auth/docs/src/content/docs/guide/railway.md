---
title: Railway
description: Set up Login with Railway using the shared OIDC flow.
---

`Railway.provider` adds Login with Railway to an [OAuth strategy](./oauth).
It verifies an ES256 ID token, merges UserInfo, and establishes your
application's session. The preset does not retain Railway GraphQL API access.

## Configure your Railway OAuth app

Create an OAuth app in your workspace's Developer settings.
Register your exact HTTPS callback, `https://app.example.com/auth/railway/callback`.
See [Login with Railway](https://docs.railway.com/integrations/oauth).

Load the credentials while building the server Layer:

```ts title="apps/server/railway.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Railway } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          railway: Railway.provider({
            clientId: yield* Config.String("RAILWAY_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("RAILWAY_CLIENT_SECRET"),
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
`openid`; request `profile` and `email` so UserInfo can return name, avatar, and
email. Start with `auth.signIn({ provider: "railway", returnTarget: "/account" })`
and redirect to the returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://backboard.railway.com", verified sub)`.
Keep `sub` unchanged; neither the email address nor the display name identifies a
local account. Never link accounts merely because profile emails match, even when
`email_verified` is true.

Railway ID tokens omit `name`, `email`, and `picture`. The preset fetches
UserInfo after ID-token verification and fills missing claims; ID-token values
win on overlap. `sub` on UserInfo must match the verified token.

The preset carries `RailwayUserProfile` through that projection. Declare the
same schema on the strategy to get typed `providerData` in
`SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { railway: Railway.RailwayUserProfile } });
```

The schema contains standard OIDC profile fields and the optional `sid` session
claim. Workspace and project scopes are API access, not this sign-in preset.

## Run the example

The [Railway application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/railway-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Railway user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/railway/callback` URL in the Railway app.
2. Set `RAILWAY_CLIENT_ID`, `RAILWAY_CLIENT_SECRET`, and `RAILWAY_USER_ID` (the
   Railway user ID used as the expected `sub`).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:railway` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Railway account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/railway-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin. This resets this example's
account link and flows. No provider grant is retained, so `OAUTH_TOKEN_KEY` is
not needed.

## Protocol profile

The preset fetches Railway's published
[discovery document](https://backboard.railway.com/oauth/.well-known/openid-configuration)
and keeps issuer `https://backboard.railway.com` for verification, with these
constraints:

| Concern                  | Behavior                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Issuer                   | Exact `https://backboard.railway.com`                                                |
| Authorization / callback | `/oauth/auth`, authorization code, query response                                    |
| Token exchange           | `/oauth/token`, `client_secret_basic`                                                |
| Signature                | Advertised ES256, keys at `/oauth/jwks`; issuer, audience, expiry and nonce verified |
| PKCE                     | S256 challenge and captured verifier on every exchange                               |
| Response issuer          | Railway advertises RFC 9207 `iss`; the callback must include it                      |
| UserInfo                 | `/oauth/me` is fetched after verification because the ID token omits profile claims  |
| Access                   | Sign-in only; no retained access, refresh or revocation in this preset               |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
