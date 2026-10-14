---
title: Google
description: Set up Sign in with Google using the shared OIDC flow.
---

`Google.provider` verifies Google identity for an [OAuth strategy](./oauth).
Your application owns account registration and session policy.

## Configure your Google Cloud client

Create an OAuth client in the [Google Cloud console](https://console.cloud.google.com/apis/credentials).
Register `https://app.example.com/auth/google/callback` as an authorized redirect URI.

```ts title="apps/server/google.ts"
import { Config, Effect, Layer } from "effect";
import { Google, Http } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          google: Google.provider({
            clientId: yield* Config.String("GOOGLE_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("GOOGLE_CLIENT_SECRET"),
            scopes: ["openid", "profile", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
and keep the Layer alive for the server's lifetime. The default scope is `openid`;
request `profile` and `email` when your application needs those claims.

Start with `auth.signIn({ provider: "google", returnTarget: "/account" })` and
redirect to the returned authorization URL. The callback completes sign-in for
an existing account; new users follow the [registration flow](./oauth#register-new-users).

The preset shows Google's account picker and requests offline access. Retaining
Google API tokens requires a [generic OIDC access configuration](../reference/oauth#generic-providers).

## Identity and Workspace policy

Use the verified Google `sub` with the provider and issuer to identify an account.
Keep email as profile data; matching email addresses do not authorize account linking.

Declare the profile schema to read typed Google claims in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { google: Google.GoogleUserProfile } });
```

`identity.profile?.providerData?.hd` contains the verified hosted-domain claim when
Google supplies it. The provider's `hd` option only hints which domain to show in
the account picker. To restrict Workspace membership, require the verified claim
to match your application's allowed domain before issuing a session.

## Run the example

The [Google application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/google-app.ts)
uses the shared Atom client, SQL storage, and an allowlisted Google `sub`.
Set `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_USER_ID`,
`SESSION_KEY`, and `OAUTH_TRANSACTION_KEY`; optionally set `GOOGLE_HOSTED_DOMAIN`.
Use distinct random keys and a reachable HTTPS origin with the registered callback.

```sh
vp run @yielded/example-auth#example:google
```

Open `APP_ORIGIN/login`. See the [example setup](https://github.com/yielded-dev/auth/tree/main/examples/auth)
for shared key and storage ownership, and [configuration rotation](../reference/oauth#configuration-rotation)
when changing client credentials.
