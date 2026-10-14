---
title: Linear
description: Set up Linear sign-in using GraphQL viewer over POST.
---

`Linear.provider` adds Linear sign-in to an [OAuth strategy](./oauth).
It exchanges an authorization code, then reads GraphQL `viewer` over POST.
The preset does not retain Linear API access.

## Configure your Linear OAuth application

Create an OAuth2 application in [Linear settings](https://linear.app/settings/api).
Register your exact HTTPS callback, `https://app.example.com/auth/linear/callback`.
Request the `read` scope unless your application needs more. Linear lists scopes
as a comma-separated authorize parameter; the preset joins them that way.
See [Linear's OAuth guide](https://linear.app/developers/oauth-2-0-authentication).

Load the credentials while building the server Layer:

```ts title="apps/server/linear.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Linear } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          linear: Linear.provider({
            clientId: yield* Config.String("LINEAR_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("LINEAR_CLIENT_SECRET"),
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`read`. Start with `auth.signIn({ provider: "linear", returnTarget: "/account" })`
and redirect to the returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://linear.app", viewer id)`.
Keep that id unchanged. Never link accounts merely because profile emails match.

The preset carries `LinearUserProfile` through the viewer projection. Declare the
same schema on the strategy to get typed `providerData` in
`SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { linear: Linear.LinearUserProfile } });
```

Linear supports PKCE. It does not advertise RFC 9207 `iss`; use a distinct
callback URL.

## Run the example

The [Linear application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/linear-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Linear user.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/linear/callback` URL in the Linear app.
2. Set `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, and `LINEAR_USER_ID` (the Linear
   user id from `viewer.id`).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:linear` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Linear account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/linear-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin.

## Protocol profile

| Concern                  | Behavior                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Issuer                   | Exact `https://linear.app`                                                                     |
| Authorization / callback | `/oauth/authorize`, authorization code, query response                                         |
| Token exchange           | `https://api.linear.app/oauth/token`, `client_secret_post`                                     |
| Identity                 | POST `https://api.linear.app/graphql` `{ viewer { id name email avatarUrl displayName url } }` |
| PKCE                     | S256 challenge and captured verifier on every exchange                                         |
| Scopes                   | Comma-separated on the authorize URL; token receipts use spaces; default `read`                |
| Response issuer          | Linear does not advertise RFC 9207 `iss`; use a distinct callback URL                          |
| Access                   | Sign-in only; no retained access, refresh, or revocation in this preset                        |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
