import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, Layer, type Redacted } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";

import { makeGoogleExample } from "./google-application";

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    const hostedDomain = yield* Config.option(Config.String("GOOGLE_HOSTED_DOMAIN"));

    return makeGoogleExample({
      origin: yield* Config.String("APP_ORIGIN"),
      clientId: yield* Config.String("GOOGLE_CLIENT_ID"),
      clientSecret: yield* Config.Redacted("GOOGLE_CLIENT_SECRET"),
      userId: yield* Config.String("GOOGLE_USER_ID"),
      ...(hostedDomain._tag === "Some" ? { hostedDomain: hostedDomain.value } : {}),
      filename: "google-auth.sqlite",
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
