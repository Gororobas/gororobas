---
title: GitHub
description: Set up GitHub sign-in with Yielded Auth.
---

Sign in with a GitHub OAuth App. Start with [OAuth setup](./oauth).

To retain GitHub API access during sign-in, configure [OAuth with an access profile](./oauth#sign-in-and-retain-provider-access).
The provider setup below supplies ordinary sign-in for your shared Auth service.

## Get your credentials

Create an OAuth App in [GitHub developer settings](https://github.com/settings/developers).
Set its callback URL to `https://app.example.com/auth/github/callback`.

## Configure the provider

```ts title="apps/server/github.ts"
import { Redacted } from "effect";
import * as GitHub from "@yielded/auth-openid-client/GitHub";
import { Http } from "@yielded/auth";

import { AppAuth } from "./auth";
import { config } from "./config";

export const AuthRoutes = Http.layer(AppAuth, {
  origin: config.AUTH_ORIGIN,
  oauth: {
    providers: {
      github: GitHub.provider({
        clientId: config.GITHUB_CLIENT_ID,
        clientSecret: Redacted.make(config.GITHUB_CLIENT_SECRET),
      }),
    },
  },
});
```

Install `openid-client` and [supply your services](../reference/oauth#supply-the-services).
`AuthRoutes` serves the callback URL derived from `origin`.
[Customize callbacks →](../reference/oauth#customize-callbacks)

GitHub sign-in requests `read:user`; no email address or repository access is required.

## Sign in

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const started = yield* auth.signIn({
  provider: "github",
  returnTarget: "/account",
});
```

Redirect to `Redacted.value(started.authorizationUrl)`.
The callback completes sign-in and redirects to `returnTarget`.
See the [browser example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-client.ts)
for the client and Atom workflow.

For GitHub API access, see [connected accounts](./oauth#use-the-session-and-provider-access).
