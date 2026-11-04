---
title: Discord
description: Set up Login with Discord using the shared OIDC flow.
---

`Discord.provider` adds Login with Discord to an [OAuth strategy](./oauth).
It verifies an RS256 ID token, merges UserInfo, and establishes your
application's session. The preset does not retain Discord API access.

## Configure your Discord application

Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
Under OAuth2, copy the client ID and secret, and register your exact HTTPS callback,
`https://app.example.com/auth/discord/callback`.
See [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2).

Load the credentials while building the server Layer:

```ts title="apps/server/discord.ts"
import { Config, Effect, Layer } from "effect";
import { Discord, Http } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          discord: Discord.provider({
            clientId: yield* Config.String("DISCORD_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("DISCORD_CLIENT_SECRET"),
            scopes: ["openid", "identify", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`openid`; request `identify` for the username, display name and avatar, and `email`
for the address. Start with `auth.signIn({ provider: "discord", returnTarget: "/account" })`
and redirect to the returned authorization URL. The callback completes sign-in.

## Identity

The durable identity is `(provider key, "https://discord.com", verified sub)`, where
`sub` is the Discord user ID. Neither the email address nor the username identifies a
local account. Never link accounts merely because profile emails match, even when
`email_verified` is true.

The preset fetches UserInfo after ID-token verification and fills missing claims;
ID-token values win on overlap. `sub` on UserInfo must match the verified token.
Discord sends `null` for an unset display name or email; those claims are omitted.
The display name is `nickname` when set, otherwise the `preferred_username`.

Declare `Discord.DiscordUserProfile` on the strategy to get typed `providerData` in
`SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { discord: Discord.DiscordUserProfile } });
```

## Run the example

The [Discord application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/discord-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Discord user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/discord/callback` URL in the Discord application.
2. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_USER_ID` (the
   Discord user ID used as the expected `sub`).
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:discord` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Discord account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different subject must not receive a session.

The example stores development state in `examples/auth/discord-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin.

## Protocol profile

The preset fetches Discord's published
[discovery document](https://discord.com/.well-known/openid-configuration) with
these constraints:

| Concern                  | Behavior                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Issuer                   | Exact `https://discord.com`                                                               |
| Authorization / callback | `/api/oauth2/authorize`, authorization code, query response                               |
| Token exchange           | `/api/oauth2/token`, `client_secret_basic`                                                |
| Signature                | Advertised RS256, keys at `/api/oauth2/keys`; issuer, audience, expiry and nonce verified |
| PKCE                     | S256 challenge and captured verifier on every exchange                                    |
| Response issuer          | Discord advertises RFC 9207 `iss`; the callback must include it                           |
| UserInfo                 | `/api/oauth2/userinfo` is fetched after verification for profile claims                   |
| Access                   | Sign-in only; no retained access, refresh or revocation in this preset                    |

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
