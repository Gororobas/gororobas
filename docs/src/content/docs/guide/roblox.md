---
title: Roblox
description: Set up Roblox sign-in using the shared OIDC flow.
---

`Roblox.provider` adds Roblox sign-in to an [OAuth strategy](./oauth).
It verifies an ES256 ID token and establishes your application's session. The
preset does not retain Open Cloud API access.

## Configure your Roblox OAuth app

Create an OAuth 2.0 app in the
[Roblox Creator Dashboard](https://create.roblox.com/dashboard/credentials).
Register your exact HTTPS callback, `https://app.example.com/auth/roblox/callback`.
Select the `openid` and `profile` identity scopes. See
[Roblox OAuth 2.0](https://create.roblox.com/docs/cloud/auth/oauth2-overview).

Load the credentials while building the server Layer:

```ts title="apps/server/roblox.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Roblox } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          roblox: Roblox.provider({
            clientId: yield* Config.String("ROBLOX_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("ROBLOX_CLIENT_SECRET"),
            scopes: ["openid", "profile"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`openid`; request `profile` when your application needs display name and avatar.
Start with `auth.signIn({ provider: "roblox", returnTarget: "/account" })` and
redirect to the returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://apis.roblox.com/oauth/", verified sub)`.
The trailing slash is part of the issuer and is preserved. `sub` is the Roblox
user ID. Usernames and display names change; do not use them as local identity.
Roblox advertises an `email` scope and claim, but third-party apps do not receive
email. Never link accounts by matching profile fields.

The preset carries `RobloxUserProfile` through ID-token projection. Declare the
same schema on the strategy to get typed `providerData` in
`SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { roblox: Roblox.RobloxUserProfile } });
```

The schema contains standard OIDC profile fields plus optional `type` and
`created_at` from the verified ID token. Fields absent from that token stay
absent; no UserInfo request is made.

## Run the example

The [Roblox application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/roblox-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Roblox user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/roblox/callback` URL in the Roblox app.
2. Set `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET`, and `ROBLOX_USER_ID` (the Roblox
   user ID used as the expected `sub`).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:roblox` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Roblox account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/roblox-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin. This resets this example's
account link and flows. No provider grant is retained, so `OAUTH_TOKEN_KEY` is
not needed.

## Protocol profile

The preset uses Roblox's [discovery document](https://apis.roblox.com/oauth/.well-known/openid-configuration)
with these constraints:

| Concern                  | Behavior                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Issuer                   | Exact `https://apis.roblox.com/oauth/`, including the trailing slash                     |
| Authorization / callback | `/oauth/v1/authorize`, authorization code, query response                                |
| Token exchange           | `/oauth/v1/token`, `client_secret_basic`                                                 |
| Signature                | Advertised ES256, keys at `/oauth/v1/certs`; issuer, audience, expiry and nonce verified |
| PKCE                     | S256 challenge and captured verifier on every exchange                                   |
| Response issuer          | Roblox does not advertise RFC 9207 `iss`; use a distinct callback URL                    |
| Access                   | Sign-in only; no retained access, refresh, revocation or UserInfo support in this preset |

Roblox's discovery currently omits PKCE metadata, while its
[authorization docs](https://create.roblox.com/docs/cloud/auth/oauth2-develop)
describe S256 `code_challenge`. The preset supplies that missing capability only
for Roblox's pinned issuer and endpoints. Explicit metadata that excludes S256
still fails configuration.

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
