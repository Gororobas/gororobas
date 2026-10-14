---
title: Zoom
description: Set up Sign in with Zoom using the shared OIDC flow.
---

`Zoom.provider` adds Sign in with Zoom to an [OAuth strategy](./oauth).
The preset is for sign-in only; it does not retain provider API access.

Create an OAuth app in [Zoom Marketplace](https://marketplace.zoom.us/) and
register `https://app.example.com/auth/zoom/callback`.
See [Zoom OAuth](https://developers.zoom.us/docs/integrations/oauth/).

```ts title="apps/server/zoom.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Zoom } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          zoom: Zoom.provider({
            clientId: yield* Config.String("ZOOM_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("ZOOM_CLIENT_SECRET"),
            scopes: ["openid", "profile", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services).
The durable identity is `(provider key, "https://zoom.us", verified sub)`.
Declare `profiles: { zoom: Zoom.ZoomUserProfile }` for typed `providerData`.

## Run the example

Run the [Zoom application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/zoom-app.ts)
with `APP_ORIGIN`,
`ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_USER_ID`, `SESSION_KEY`, and
`OAUTH_TRANSACTION_KEY`. Register `/auth/zoom/callback` on an HTTPS origin
forwarded to `127.0.0.1:3000`.

```sh
vp run @yielded/example-auth#example:zoom
```

Open `APP_ORIGIN/login`. See the
[example setup](https://github.com/yielded-dev/auth/tree/main/examples/auth)
for key and storage ownership.
