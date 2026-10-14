import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, Layer, type Redacted } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";

import { makeSlackExample } from "./slack-application";

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    return makeSlackExample({
      origin: yield* Config.String("APP_ORIGIN"),
      clientId: yield* Config.String("SLACK_CLIENT_ID"),
      clientSecret: yield* Config.Redacted("SLACK_CLIENT_SECRET"),
      userId: yield* Config.String("SLACK_USER_ID"),
      teamId: yield* Config.String("SLACK_TEAM_ID"),
      filename: "slack-auth.sqlite",
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
