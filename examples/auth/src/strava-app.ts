import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import * as Strava from "@yielded/auth/Strava";
import type { Redacted } from "effect";
import { Config, Effect, Layer } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";

import { makeExample } from "./oauth-application";

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const origin = yield* Config.String("APP_ORIGIN").pipe(
      Config.withDefault("http://localhost:3000"),
    );

    const clientId = yield* Config.String("STRAVA_CLIENT_ID");
    const clientSecret = yield* Config.Redacted("STRAVA_CLIENT_SECRET");
    const externalSubject = yield* Config.String("STRAVA_ATHLETE_ID");

    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    const profile = Strava.accessProfile({ clientId, scopes: ["activity:read_all"] });

    const example = makeExample({
      origin,
      profile,
      provider: Strava.provider({ clientId, clientSecret, access: profile }),
      issuer: "https://www.strava.com",
      externalSubject,
      subjectId: `strava:${externalSubject}`,
      filename: "strava-auth-v2.sqlite",
      sessionKeys: keyring(yield* Config.Redacted("SESSION_KEY")),
      transactionKeys: keyring(yield* Config.Redacted("OAUTH_TRANSACTION_KEY")),
      tokenKeys: keyring(yield* Config.Redacted("OAUTH_TOKEN_KEY")),
    });

    return example.routes;
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
