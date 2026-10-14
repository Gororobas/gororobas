import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, Layer, type Redacted } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";

import { makeMicrosoftExample } from "./microsoft-application";

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    return makeMicrosoftExample({
      origin: yield* Config.String("APP_ORIGIN"),
      clientId: yield* Config.String("MICROSOFT_CLIENT_ID"),
      clientSecret: yield* Config.Redacted("MICROSOFT_CLIENT_SECRET"),
      objectId: yield* Config.String("MICROSOFT_OBJECT_ID"),
      tenantId: yield* Config.String("MICROSOFT_TENANT_ID"),
      filename: "microsoft-auth.sqlite",
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
