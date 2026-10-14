import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, FileSystem, Layer, Path } from "effect";
import { HttpMiddleware, HttpRouter, HttpServerResponse } from "effect/http";

import { CryptoLive } from "../../shared/crypto";
import { DatabaseLive } from "./data";
import { settingsApplication } from "./oauth-settings-application";
import { SettingsKeysLive } from "./oauth-settings-keys";

const server = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port("AUTH_PORT").pipe(Config.withDefault(4185));

    const origin = yield* Config.URL("AUTH_ORIGIN").pipe(
      Config.withDefault(new URL(`http://localhost:${port}`)),
    );

    const clientId = yield* Config.String("GITHUB_CLIENT_ID");
    const clientSecret = yield* Config.Redacted("GITHUB_CLIENT_SECRET");
    const externalSubject = yield* Config.String("GITHUB_USER_ID");

    const displayName = yield* Config.String("YIELDED_DISPLAY_NAME").pipe(
      Config.withDefault("Yielded member"),
    );

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = new URL("../dist/", import.meta.url).pathname;
    const html = yield* fs.readFileString(path.join(root, "oauth-settings.html"));
    const assets = yield* fs.readDirectory(path.join(root, "assets"));

    const page = HttpServerResponse.text(html, {
      contentType: "text/html",
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });

    const application = settingsApplication({
      origin,
      clientId,
      clientSecret,
      externalSubject,
      displayName,
    }).pipe(Layer.provide(DatabaseLive), Layer.provide(SettingsKeysLive));

    const routes = Layer.mergeAll(
      application,
      HttpRouter.add("GET", "/", HttpServerResponse.redirect("/oauth-settings")),
      ...(["/oauth-settings", "/oauth-settings/callback"] as const).map((route) =>
        HttpRouter.add("GET", route, page),
      ),
      ...(["ink", "paper"] as const).map((mode) =>
        HttpRouter.add(
          "GET",
          `/brand/auth-${mode}.svg`,
          HttpServerResponse.file(
            new URL(`../../../.github/assets/lockup-auth-${mode}.svg`, import.meta.url).pathname,
          ),
        ),
      ),
      HttpRouter.addAll(
        assets.map((name) =>
          HttpRouter.route(
            "GET",
            `/assets/${name}`,
            HttpServerResponse.file(path.join(root, "assets", name)),
          ),
        ),
      ),
    );

    return HttpRouter.serve(routes, { disableLogger: true }).pipe(
      Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port })),
      Layer.provide(Layer.succeed(HttpMiddleware.TracerDisabledWhen, () => true)),
    );
  }),
).pipe(Layer.provide(CryptoLive), Layer.provide(BunServices.layer));

if (import.meta.main) BunRuntime.runMain(Layer.launch(server));
