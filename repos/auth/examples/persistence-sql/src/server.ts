import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Http, Passkey } from "@yielded/auth";
import { Config, Effect, FileSystem, Layer, Path } from "effect";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";

import { AppAuth } from "../../shared/account/auth";
import { DeliveryLive } from "../../shared/account/delivery";
import { browserLoginRoutes } from "./browser-login";
import { DatabaseLive, KeysLive } from "./data";
import { AuthLive } from "./live";
import { ScreeningLive } from "./screening";

const PageRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = new URL("../dist/", import.meta.url).pathname;
    const assets = yield* fs.readDirectory(path.join(root, "assets"));

    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/",
        HttpServerResponse.file(path.join(root, "index.html"), {
          headers: { "cache-control": "no-store" },
        }),
      ),
      HttpRouter.add(
        "GET",
        "/login",
        HttpServerResponse.file(path.join(root, "index.html"), {
          headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
        }),
      ),
      // Register only built assets; request paths never become filesystem paths.
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
  }),
);

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port("AUTH_PORT").pipe(Config.withDefault(4183));

    const origin = yield* Config.URL("AUTH_ORIGIN").pipe(
      Config.withDefault(new URL(`http://localhost:${port}`)),
    );

    const passkeys = Passkey.PasskeyConfig.layer({
      id: origin.hostname,
      name: "Yielded Auth · Example 03",
      origins: [origin.origin],
      developmentLocalhost: origin.protocol === "http:",
    });

    const http = Http.make(AppAuth, {
      origin: origin.origin,
      cookie: { prefix: "sql-example-", secure: origin.protocol === "https:" },
    });

    const infrastructure = Layer.mergeAll(
      DatabaseLive,
      KeysLive,
      DeliveryLive,
      ScreeningLive,
      passkeys,
    ).pipe(Layer.provide([FetchHttpClient.layer, BunServices.layer]));

    const ApplicationLive = AuthLive.pipe(Layer.provide(infrastructure));
    const NativeRoutes = browserLoginRoutes(origin).pipe(Layer.provide(infrastructure));

    const Routes = Layer.mergeAll(http.routes(), PageRoutes, NativeRoutes).pipe(
      Layer.provide(ApplicationLive),
    );

    return HttpRouter.serve(Routes, { disableLogger: true }).pipe(
      Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port })),
      Layer.provide(BunServices.layer),
    );
  }),
);

if (import.meta.main) BunRuntime.runMain(Layer.launch(ServerLive));
