import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { X } from "@yielded/auth";
import { Config, Effect, Layer, type Redacted } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";

import { makeOAuthSignInExample } from "./oauth-signin-application";

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    const clientId = yield* Config.String("X_CLIENT_ID");
    const clientSecret = yield* Config.Redacted("X_CLIENT_SECRET");
    const userId = yield* Config.String("X_USER_ID");

    return makeOAuthSignInExample({
      origin: yield* Config.String("APP_ORIGIN"),
      provider: "x",
      issuer: "https://x.com",
      title: "Sign in with X",
      externalSubject: userId,
      filename: "x-auth.sqlite",
      sessionKeys: keyring(yield* Config.Redacted("SESSION_KEY")),
      transactionKeys: keyring(yield* Config.Redacted("OAUTH_TRANSACTION_KEY")),
      profile: X.XUserProfile,
      strategy: X.provider({
        clientId,
        clientSecret,
        scopes: ["users.read", "tweet.read", "users.email"],
      }),
    });
  }),
);

HttpRouter.serve(runtime, { disableLogger: true }).pipe(
  Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port: 3000 })),
  Layer.provide(Layer.succeed(HttpMiddleware.TracerDisabledWhen, () => true)),
  Layer.provide(BunServices.layer),
  Layer.launch,
  BunRuntime.runMain,
);
