---
title: Notion
description: Set up Notion sign-in using the token-response user.
---

`Notion.provider` adds Notion public-connection sign-in to an
[OAuth strategy](./oauth). Identity is `owner.user` on the token response.
`/v1/users/me` is the bot and is not used. The preset does not retain Notion
API access.

## Configure your Notion public connection

Create a public connection in the [Notion developer portal](https://www.notion.so/my-integrations).
Register your exact HTTPS callback, `https://app.example.com/auth/notion/callback`.
Notion token exchange uses HTTP Basic authentication and a JSON body. The preset
does not send PKCE. Authorize requests set `owner=user`.
See [Notion authorization](https://developers.notion.com/docs/authorization).

Load the credentials while building the server Layer:

```ts title="apps/server/notion.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Notion } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          notion: Notion.provider({
            clientId: yield* Config.String("NOTION_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("NOTION_CLIENT_SECRET"),
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. Start with
`auth.signIn({ provider: "notion", returnTarget: "/account" })` and redirect to
the returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://api.notion.com", owner.user.id)`.
Keep that user id unchanged. Never link accounts merely because profile emails
match. A bot `owner.user` is rejected.

The decoder copies user and workspace display fields into `providerData`. It
does not copy access or refresh tokens from the receipt.

The preset carries `NotionUserProfile`. Declare the same schema on the strategy
to get typed `providerData` in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { notion: Notion.NotionUserProfile } });
```

Notion does not advertise RFC 9207 `iss`; use a distinct callback URL.

## Run the example

The [Notion application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/notion-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Notion user.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/notion/callback` URL on the public connection.
2. Set `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, and `NOTION_USER_ID` (the
   authorizing user's id from `owner.user.id`).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:notion` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Notion account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/notion-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin.

## Protocol profile

| Concern                  | Behavior                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| Issuer                   | Exact `https://api.notion.com`                                              |
| Authorization / callback | `/v1/oauth/authorize` with `owner=user`, authorization code, query response |
| Token exchange           | `/v1/oauth/token`, HTTP Basic, JSON body                                    |
| Identity                 | `owner.user` on the token response; `/v1/users/me` is not used              |
| PKCE                     | Not sent                                                                    |
| Response issuer          | Notion does not advertise RFC 9207 `iss`; use a distinct callback URL       |
| Access                   | Sign-in only; no retained access in this preset                             |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
