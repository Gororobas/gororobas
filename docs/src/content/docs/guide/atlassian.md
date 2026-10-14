---
title: Atlassian
description: Set up Sign in with Atlassian using authorization-code PKCE and /me.
---

`Atlassian.provider` adds Sign in with Atlassian to an [OAuth strategy](./oauth).
It reads identity from one GET to `/me` and establishes your application's
session. The preset does not retain Atlassian API access or list sites.

## Configure your Atlassian app

Create an OAuth 2.0 (3LO) app in the
[Atlassian developer console](https://developer.atlassian.com/console/myapps/).
Add the User Identity API, register your exact HTTPS callback,
`https://app.example.com/auth/atlassian/callback`, and add the `read:me` scope.
Add `offline_access` only when a later connected grant needs a refresh token.
The preset sends `audience=api.atlassian.com` and `prompt=consent`. Token
requests use `client_secret_post`. PKCE is required.
See [Atlassian's 3LO guide](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/).

Load the credentials while building the server Layer:

```ts title="apps/server/atlassian.ts"
import { Config, Effect, Layer } from "effect";
import { Atlassian, Http } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          atlassian: Atlassian.provider({
            clientId: yield* Config.String("ATLASSIAN_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("ATLASSIAN_CLIENT_SECRET"),
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`read:me`. Start with
`auth.signIn({ provider: "atlassian", returnTarget: "/account" })` and redirect
to the returned authorization URL. The callback completes sign-in.

## Identity and site access

The durable identity is `(provider key, "https://auth.atlassian.com", account_id)`.
Keep `account_id` unchanged. Never link accounts merely because profile emails match.

The preset carries `AtlassianUserProfile` from `/me`. Declare the same schema on
the strategy to get typed `providerData` in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { atlassian: Atlassian.AtlassianUserProfile } });
```

Atlassian does not assert email verification. Site cloud IDs are not part of
this identity. After your application retains a grant, call
`GET https://api.atlassian.com/oauth/token/accessible-resources` for the sites
that token can reach.

## Run the example

The [Atlassian application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/atlassian-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Atlassian account and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/atlassian/callback` URL in the Atlassian app.
2. Set `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, and `ATLASSIAN_ACCOUNT_ID`.
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:atlassian` from the repository root and
   open `APP_ORIGIN/login`. Sign in with the configured Atlassian account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.

The example stores development state in `examples/auth/atlassian-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin. No provider grant is
retained, so `OAUTH_TOKEN_KEY` is not needed.

## Protocol profile

| Concern                  | Behavior                                                                |
| ------------------------ | ----------------------------------------------------------------------- |
| Issuer                   | Exact `https://auth.atlassian.com`                                      |
| Authorization / callback | `/authorize` with `audience=api.atlassian.com` and `prompt=consent`     |
| Token exchange           | `/oauth/token`, `client_secret_post`                                    |
| Identity                 | `GET https://api.atlassian.com/me`                                      |
| PKCE                     | S256 challenge and captured verifier on every exchange                  |
| Response issuer          | Atlassian does not send RFC 9207 `iss`; use a distinct callback URL     |
| Access                   | Sign-in only; no retained access, refresh, or revocation in this preset |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
