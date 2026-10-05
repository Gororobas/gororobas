---
title: Google
description: Set up Google sign-in with Yielded Auth.
---

Sign in with Google's OpenID Connect provider. Start with [OAuth setup](./oauth).

## Get your credentials

Create an OAuth client in the [Google Cloud console](https://console.cloud.google.com/apis/credentials).
Add `https://app.example.com/auth/google/callback` as an authorized redirect URI.

## Configure the provider

```ts title="apps/server/google.ts"
import { Redacted } from "effect";
import { Http } from "@yielded/auth";
import * as OpenIdClient from "@yielded/auth-openid-client";

import { AppAuth } from "./auth";
import { config } from "./config";

export const AuthRoutes = Http.layer(AppAuth, {
  origin: config.AUTH_ORIGIN,
  oauth: {
    providers: {
      google: OpenIdClient.provider({
        protocol: "oidc",
        issuer: "https://accounts.google.com",
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: Redacted.make(config.GOOGLE_CLIENT_SECRET),
        tokenEndpointAuthMethod: "client_secret_post",
      }),
    },
  },
});
```

Install `openid-client` and [supply your services](../reference/oauth#supply-the-services).
`AuthRoutes` serves the callback URL derived from `origin`.
[Customize callbacks →](../reference/oauth#customize-callbacks)

The default `openid` scope is enough for sign-in.

## Sign in

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const started = yield* auth.signIn({
  provider: "google",
  returnTarget: "/account",
});
```

Redirect to `Redacted.value(started.authorizationUrl)`.
The callback completes sign-in and redirects to `returnTarget`.
See the [server example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-server.ts)
for Google and GitHub together.
