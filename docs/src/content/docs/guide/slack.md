---
title: Slack
description: Set up Sign in with Slack using the shared OIDC flow.
---

`Slack.provider` adds Sign in with Slack to an [OAuth strategy](./oauth).
It verifies an ID token and establishes your application's session. The preset
does not retain Slack API access or install a bot.

## Configure your Slack app

Create an app in [Slack app management](https://api.slack.com/apps).
Under **OAuth & Permissions**, register your exact HTTPS callback,
`https://app.example.com/auth/slack/callback`, and add the user scopes `openid`,
`profile`, and `email`. Find the client ID and client secret under **Basic Information**.
Keep Sign in with Slack scopes separate from bot and other Web API scopes;
Slack requires separate authorization flows for those permissions.
See [Slack's setup guide](https://docs.slack.dev/authentication/sign-in-with-slack/).

Load the credentials while building the server Layer:

```ts title="apps/server/slack.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Slack } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          slack: Slack.provider({
            clientId: yield* Config.String("SLACK_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("SLACK_CLIENT_SECRET"),
            scopes: ["openid", "profile", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`openid`; request `profile` and `email` only when your application needs them.
Start with `auth.signIn({ provider: "slack", returnTarget: "/account" })` and
redirect to the returned authorization URL. Use a distinct callback for this provider.
The callback signs in an existing account; new users follow the
[registration flow](./oauth#register-new-users).

## Identity and workspace policy

The durable identity is `(provider key, "https://slack.com", verified sub)`.
Keep `sub` unchanged; neither the email address nor workspace name identifies a
local account. Never link accounts merely because profile emails match, even when
`email_verified` is true.

The preset carries `SlackUserProfile` through ID-token projection. Declare the
same schema on the strategy to get typed `providerData` in
`SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { slack: Slack.SlackUserProfile } });
```

`identity.profile?.providerData?.["https://slack.com/team_id"]` contains the verified
workspace ID when Slack supplies it. The profile also exposes the optional
`https://slack.com/user_id` claim. Missing claims stay absent.

The optional `team` provider option hints which workspace to use on Slack's consent
screen. It does **not** restrict membership. Applications requiring a workspace
must compare the verified `team_id` against their own policy and reject missing or
different values before issuing a session. The runnable example does this.

## Run the example

The [Slack application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/slack-app.ts)
accepts one configured user and workspace. Set `APP_ORIGIN`, `SLACK_CLIENT_ID`,
`SLACK_CLIENT_SECRET`, `SLACK_USER_ID`, `SLACK_TEAM_ID`, `SESSION_KEY`, and
`OAUTH_TRANSACTION_KEY`.

```sh
vp run @yielded/example-auth#example:slack
```

Open `APP_ORIGIN/login`. Use a reachable HTTPS origin with the registered callback;
see the [example setup](https://github.com/yielded-dev/auth/tree/main/examples/auth)
for key and storage ownership. Keep Sign in with Slack separate from any bot installation.
