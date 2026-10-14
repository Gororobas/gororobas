---
title: Vercel
description: Set up Sign in with Vercel using the shared OIDC flow.
---

`Vercel.provider` adds Sign in with Vercel to an [OAuth strategy](./oauth).
The preset is for sign-in only; it does not retain provider API access.

Create a Vercel OAuth app and register `https://app.example.com/auth/vercel/callback`.
See [Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel).

```ts title="apps/server/vercel.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Vercel } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          vercel: Vercel.provider({
            clientId: yield* Config.String("VERCEL_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("VERCEL_CLIENT_SECRET"),
            scopes: ["openid", "profile", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services).
The durable identity is `(provider key, "https://vercel.com", verified sub)`.
Declare `profiles: { vercel: Vercel.VercelUserProfile }` for typed `providerData`.
Use a distinct callback for this provider.

## Run the example

Run the [Vercel application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/vercel-app.ts)
with `APP_ORIGIN`,
`VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, `VERCEL_USER_ID`, `SESSION_KEY`, and
`OAUTH_TRANSACTION_KEY`. Register `/auth/vercel/callback` on an HTTPS origin
forwarded to `127.0.0.1:3000`.

```sh
vp run @yielded/example-auth#example:vercel
```

Open `APP_ORIGIN/login`. See the
[example setup](https://github.com/yielded-dev/auth/tree/main/examples/auth)
for key and storage ownership.
