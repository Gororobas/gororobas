---
title: X
description: Set up Sign in with X using authorization-code PKCE and /2/users/me.
---

`X.provider` adds Sign in with X to an [OAuth strategy](./oauth).
It reads identity from one GET to `/2/users/me` and establishes your application's
session. The preset does not retain X API access.

## Configure your X app

Create an app in the [X developer portal](https://developer.x.com/en/portal/dashboard).
Enable OAuth 2.0, register your exact HTTPS callback,
`https://app.example.com/auth/x/callback`, and add the scopes `users.read` and
`tweet.read`. Add `users.email` when the application needs `confirmed_email`.
Add `offline.access` only when a later connected grant needs a refresh token.
Confidential clients use HTTP Basic at the token endpoint. PKCE is required.
See [X's authorization-code guide](https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code).

Load the credentials while building the server Layer:

```ts title="apps/server/x.ts"
import { Config, Effect, Layer } from "effect";
import { Http, X } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          x: X.provider({
            clientId: yield* Config.String("X_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("X_CLIENT_SECRET"),
            scopes: ["users.read", "tweet.read", "users.email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scopes are
`users.read` and `tweet.read`. Start with
`auth.signIn({ provider: "x", returnTarget: "/account" })` and redirect to the
returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://x.com", user id)`.
Keep that id unchanged. Never link accounts merely because profile emails match.

The preset carries `XUserProfile` from `/2/users/me`. Declare the same schema on
the strategy to get typed `providerData` in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { x: X.XUserProfile } });
```

`confirmed_email` is absent unless `users.email` was granted. The adapter copies
it into the display `email` field and does not set `emailVerified`.

## Run the example

The [X application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/x-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured X user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/x/callback` URL in the X app.
2. Set `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_USER_ID`.
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:x` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured X account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.

The example stores development state in `examples/auth/x-auth.sqlite`. To start
over, stop the example, remove only that database and its SQLite sidecar files,
and clear cookies for the development origin. No provider grant is retained, so
`OAUTH_TOKEN_KEY` is not needed.

## Protocol profile

| Concern                  | Behavior                                                                |
| ------------------------ | ----------------------------------------------------------------------- |
| Issuer                   | Exact `https://x.com`                                                   |
| Authorization / callback | `/i/oauth2/authorize`, authorization code, query response               |
| Token exchange           | `https://api.x.com/2/oauth2/token`, `client_secret_basic`               |
| Identity                 | `GET /2/users/me?user.fields=confirmed_email,profile_image_url`         |
| PKCE                     | S256 challenge and captured verifier on every exchange                  |
| Response issuer          | X does not send RFC 9207 `iss`; use a distinct callback URL             |
| Access                   | Sign-in only; no retained access, refresh, or revocation in this preset |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
