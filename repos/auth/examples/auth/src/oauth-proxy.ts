import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, Layer, type Redacted } from "effect";
import { FetchHttpClient, HttpMiddleware, HttpRouter } from "effect/http";

import {
  HttpsOrigin,
  localOrigin,
  makeProxyEnvironment,
  makeProxyServer,
} from "./oauth-proxy-application";

const keyring = (material: Redacted.Redacted<string>) => ({
  activeKeyId: "v1",
  keys: [{ id: "v1", material }],
});

const program = Effect.gen(function* () {
  const mode = yield* Config.Literals(["proxy", "local", "preview"], "MODE");

  const port = yield* Config.Port("PORT").pipe(
    Config.withDefault(mode === "proxy" ? 4000 : mode === "local" ? 3000 : 3001),
  );

  const origin = yield* mode === "local"
    ? Config.Literals([localOrigin], "APP_ORIGIN").pipe(Config.withDefault(localOrigin))
    : Config.schema(HttpsOrigin, "APP_ORIGIN");

  const filename = yield* Config.String("SQLITE_FILENAME").pipe(
    Config.withDefault(`oauth-${mode}.sqlite`),
  );

  // TLS terminates at a trusted reverse proxy; only its loopback upstream is exposed.
  const serve = <E, R>(routes: Layer.Layer<never, E, R>) =>
    HttpRouter.serve(routes, { disableLogger: true }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port })),
      Layer.provide(Layer.succeed(HttpMiddleware.TracerDisabledWhen, () => true)),
    );

  if (mode === "proxy") {
    const proxy = makeProxyServer({
      origin,
      previewOrigin: yield* Config.schema(HttpsOrigin, "PREVIEW_ORIGIN"),
      clientId: yield* Config.String("GITHUB_CLIENT_ID"),
      clientSecret: yield* Config.Redacted("GITHUB_CLIENT_SECRET"),
      localSecret: yield* Config.Redacted("LOCAL_PROXY_SECRET"),
      previewSecret: yield* Config.Redacted("PREVIEW_PROXY_SECRET"),
      keys: keyring(yield* Config.Redacted("PROXY_ENCRYPTION_KEY")),
      filename,
    });

    return yield* Layer.launch(serve(proxy.routes));
  }

  const app = makeProxyEnvironment({
    origin,
    proxyUrl: yield* Config.String("PROXY_URL"),
    environment: mode,
    secret: yield* Config.Redacted("PROXY_SECRET"),
    externalSubject: yield* Config.String("GITHUB_USER_ID"),
    sessionKeys: keyring(yield* Config.Redacted("SESSION_KEY")),
    transactionKeys: keyring(yield* Config.Redacted("OAUTH_TRANSACTION_KEY")),
    filename,
  });

  return yield* Layer.launch(serve(app.routes));
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
