---
title: Dropbox
description: Set up Dropbox sign-in using POST account identity.
---

`Dropbox.provider` adds Dropbox sign-in to an [OAuth strategy](./oauth).
It exchanges an authorization code, then POSTs `/2/users/get_current_account`.
The preset does not retain Dropbox API access.

## Configure your Dropbox app

Create an app in [Dropbox App Console](https://www.dropbox.com/developers/apps).
Register your exact HTTPS callback, `https://app.example.com/auth/dropbox/callback`.
Scoped apps need `account_info.read` to read the current account. The preset
sends S256 PKCE even though Dropbox does not advertise it.
See [Dropbox authentication](https://www.dropbox.com/developers/reference/auth-types).

Load the credentials while building the server Layer:

```ts title="apps/server/dropbox.ts"
import { Config, Effect, Layer } from "effect";
import { Dropbox, Http } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          dropbox: Dropbox.provider({
            clientId: yield* Config.String("DROPBOX_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("DROPBOX_CLIENT_SECRET"),
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`account_info.read`. Start with
`auth.signIn({ provider: "dropbox", returnTarget: "/account" })` and redirect to
the returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://www.dropbox.com", account_id)`.
Keep `account_id` unchanged. Never link accounts merely because profile emails
match, even when `email_verified` is true.

The preset carries `DropboxUserProfile` through the account projection. Declare
the same schema on the strategy to get typed `providerData` in
`SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { dropbox: Dropbox.DropboxUserProfile } });
```

A disabled Dropbox account is rejected. Dropbox does not advertise RFC 9207
`iss`; use a distinct callback URL.

## Run the example

The [Dropbox application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/dropbox-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Dropbox account.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/dropbox/callback` URL in the Dropbox app.
2. Set `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET`, and `DROPBOX_ACCOUNT_ID`
   (the `account_id`, usually starting with `dbid:`).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:dropbox` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Dropbox account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/dropbox-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin.

## Protocol profile

| Concern                  | Behavior                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| Issuer                   | Exact `https://www.dropbox.com`                                                  |
| Authorization / callback | `/oauth2/authorize`, authorization code, query response                          |
| Token exchange           | `https://api.dropboxapi.com/oauth2/token`, `client_secret_post`                  |
| Identity                 | POST `https://api.dropboxapi.com/2/users/get_current_account` with an empty body |
| PKCE                     | S256 challenge and captured verifier on every exchange                           |
| Scopes                   | Default `account_info.read`                                                      |
| Response issuer          | Dropbox does not advertise RFC 9207 `iss`; use a distinct callback URL           |
| Access                   | Sign-in only; no retained access, refresh, or revocation in this preset          |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
