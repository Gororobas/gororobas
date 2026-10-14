---
title: GitHub
description: Set up GitHub sign-in with Yielded Auth.
---

Sign in with a GitHub OAuth App. Start with [OAuth setup](./oauth).

## Get your credentials

Create an OAuth App in [GitHub developer settings](https://github.com/settings/developers).
Set its callback URL to `https://app.example.com/auth/github/callback`.

## Configure the provider

```ts title="apps/server/github.ts"
import { Redacted } from "effect";
import * as GitHub from "@yielded/auth/GitHub";
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

[Supply your services](../reference/oauth#supply-the-services) and keep the Layer
alive for the server's lifetime. `AuthRoutes` derives the callback URL from `origin`.
GitHub sign-in requests `read:user` by default.

## Private email for registration

Set `verifiedPrimaryEmail: true` on the provider registration to request
`user:email`. A verified primary address becomes `profile.email` with
`profile.emailVerified: true`. If none is available, your application decides
whether to request an email separately or decline registration.

The numeric GitHub ID identifies the account. Email is profile data and must not
be used to automatically link accounts. When retaining API access, also include
`user:email` in the connected profile's scopes. See
[email permission](../reference/oauth#github-email-permission) for the options and limits.

## Sign in

```ts
const auth = yield* AppAuth;
const started = yield* auth.signIn({
  provider: "github",
  returnTarget: "/account",
});
```

Redirect to `Redacted.value(started.authorizationUrl)`. The callback signs in an
existing account and returns to `returnTarget`. Use the
[registration flow](./oauth#register-new-users) for new accounts.

The [browser example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-client.ts)
shows the client and Atom workflow. To retain provider tokens, configure
[OAuth with an access profile](./oauth#sign-in-and-retain-provider-access).
