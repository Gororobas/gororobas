import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, Layer, type Redacted } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";

import { makeAppleExample } from "./apple-application";

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    return makeAppleExample({
      origin: yield* Config.String("APP_ORIGIN"),
      clientId: yield* Config.String("APPLE_CLIENT_ID"),
      teamId: yield* Config.String("APPLE_TEAM_ID"),
      keyId: yield* Config.String("APPLE_KEY_ID"),
      privateKey: yield* Config.Redacted("APPLE_PRIVATE_KEY"),
      userId: yield* Config.String("APPLE_USER_ID"),
      filename: "apple-auth.sqlite",
      sessionKeys: keyring(yield* Config.Redacted("SESSION_KEY")),
      transactionKeys: keyring(yield* Config.Redacted("OAUTH_TRANSACTION_KEY")),
    });
  }),
);

// Callback URLs contain credentials; do not record them in request logs or traces.
HttpRouter.serve(runtime, { disableLogger: true }).pipe(
  Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port: 3000 })),
  Layer.provide(Layer.succeed(HttpMiddleware.TracerDisabledWhen, () => true)),
  Layer.provide(BunServices.layer),
  Layer.launch,
  BunRuntime.runMain,
);
