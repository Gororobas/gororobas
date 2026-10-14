import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Kick } from "@yielded/auth";
import { Config, Effect, Layer, type Redacted } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";

import { makeOAuthSignInExample } from "./oauth-signin-application";

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    const clientId = yield* Config.String("KICK_CLIENT_ID");
    const clientSecret = yield* Config.Redacted("KICK_CLIENT_SECRET");
    const userId = yield* Config.String("KICK_USER_ID");

    return makeOAuthSignInExample({
      origin: yield* Config.String("APP_ORIGIN"),
      provider: "kick",
      issuer: "https://id.kick.com",
      title: "Sign in with Kick",
      externalSubject: userId,
      filename: "kick-auth.sqlite",
      sessionKeys: keyring(yield* Config.Redacted("SESSION_KEY")),
      transactionKeys: keyring(yield* Config.Redacted("OAUTH_TRANSACTION_KEY")),
      profile: Kick.KickUserProfile,
      strategy: Kick.provider({ clientId, clientSecret }),
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
