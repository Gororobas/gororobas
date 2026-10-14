---
title: Kick
description: Set up Sign in with Kick using authorization-code PKCE and /public/v1/users.
---

`Kick.provider` adds Sign in with Kick to an [OAuth strategy](./oauth).
It reads identity from one GET to `/public/v1/users` and establishes your
application's session. The preset does not retain Kick API access.

## Configure your Kick app

Create an app in [Kick developer settings](https://kick.com/developer).
Register your exact HTTPS callback, `https://app.example.com/auth/kick/callback`,
and add the `user:read` scope. Token requests send `client_id` and
`client_secret` in the form body. PKCE with S256 is required.
See [Kick's OAuth 2.1 guide](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow).

Load the credentials while building the server Layer:

```ts title="apps/server/kick.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Kick } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          kick: Kick.provider({
            clientId: yield* Config.String("KICK_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("KICK_CLIENT_SECRET"),
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`user:read`. Start with
`auth.signIn({ provider: "kick", returnTarget: "/account" })` and redirect to the
returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://id.kick.com", user_id)`.
Keep that numeric id as a string. Never link accounts merely because profile
emails match.

The preset carries `KickUserProfile` from the first user in `/public/v1/users`
when that request has no `id` query. Declare the same schema on the strategy to
get typed `providerData` in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { kick: Kick.KickUserProfile } });
```

Kick does not assert email verification. An empty `data` array is rejected.

## Run the example

The [Kick application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/kick-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Kick user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/kick/callback` URL in the Kick app.
2. Set `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, and `KICK_USER_ID`.
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:kick` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Kick account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.

The example stores development state in `examples/auth/kick-auth.sqlite`. To start
over, stop the example, remove only that database and its SQLite sidecar files,
and clear cookies for the development origin. No provider grant is retained, so
`OAUTH_TOKEN_KEY` is not needed.

## Protocol profile

| Concern                  | Behavior                                                                |
| ------------------------ | ----------------------------------------------------------------------- |
| Issuer                   | Exact `https://id.kick.com`                                             |
| Authorization / callback | `/oauth/authorize`, authorization code, query response                  |
| Token exchange           | `/oauth/token`, `client_secret_post`                                    |
| Identity                 | `GET https://api.kick.com/public/v1/users` with no `id` query           |
| PKCE                     | S256 challenge and captured verifier on every exchange                  |
| Response issuer          | Kick does not send RFC 9207 `iss`; use a distinct callback URL          |
| Access                   | Sign-in only; no retained access, refresh, or revocation in this preset |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
