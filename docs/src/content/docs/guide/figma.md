---
title: Figma
description: Set up Sign in with Figma using authorization-code PKCE and /v1/me.
---

`Figma.provider` adds Sign in with Figma to an [OAuth strategy](./oauth).
It reads identity from one GET to `/v1/me` and establishes your application's
session. The preset does not retain Figma API access.

## Configure your Figma app

Create an OAuth app in [Figma developer settings](https://www.figma.com/developers/apps).
Register your exact HTTPS callback, `https://app.example.com/auth/figma/callback`,
and add the `current_user:read` scope. Token requests use HTTP Basic. PKCE is
required and only S256 is supported. Authorization codes expire in 30 seconds.
See [Figma's OAuth apps guide](https://developers.figma.com/docs/rest-api/oauth-apps/).

Load the credentials while building the server Layer:

```ts title="apps/server/figma.ts"
import { Config, Effect, Layer } from "effect";
import { Figma, Http } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          figma: Figma.provider({
            clientId: yield* Config.String("FIGMA_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("FIGMA_CLIENT_SECRET"),
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`current_user:read`. Start with
`auth.signIn({ provider: "figma", returnTarget: "/account" })` and redirect to the
returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://www.figma.com", user id)`.
Keep that id unchanged. Never link accounts merely because profile emails match.

The preset carries `FigmaUserProfile` from `/v1/me`. Declare the same schema on
the strategy to get typed `providerData` in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { figma: Figma.FigmaUserProfile } });
```

Figma does not assert email verification.

## Run the example

The [Figma application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/figma-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Figma user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/figma/callback` URL in the Figma app.
2. Set `FIGMA_CLIENT_ID`, `FIGMA_CLIENT_SECRET`, and `FIGMA_USER_ID`.
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:figma` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Figma account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.

The example stores development state in `examples/auth/figma-auth.sqlite`. To start
over, stop the example, remove only that database and its SQLite sidecar files,
and clear cookies for the development origin. No provider grant is retained, so
`OAUTH_TOKEN_KEY` is not needed.

## Protocol profile

| Concern                  | Behavior                                                                |
| ------------------------ | ----------------------------------------------------------------------- |
| Issuer                   | Exact `https://www.figma.com`                                           |
| Authorization / callback | `/oauth`, authorization code, query response                            |
| Token exchange           | `https://api.figma.com/v1/oauth/token`, `client_secret_basic`           |
| Identity                 | `GET /v1/me`                                                            |
| PKCE                     | S256 challenge and captured verifier on every exchange                  |
| Response issuer          | Figma does not send RFC 9207 `iss`; use a distinct callback URL         |
| Access                   | Sign-in only; no retained access, refresh, or revocation in this preset |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
