import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Hooks, Http } from "@yielded/auth";
import { Effect, FileSystem, Layer, Path } from "effect";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";

import { DeliveryLive } from "../../shared/account/delivery";
import { AppAuth } from "./auth";
import { KeysLive } from "./data";
import { AuthLive } from "./live";
import { ScreeningLive } from "./screening";
import { AccountStore } from "./store";

const port = 4184;
const origin = `http://localhost:${port}`;
const http = Http.make(AppAuth, { origin, cookie: { prefix: "services-example-", secure: false } });

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

const ApplicationLive = AuthLive.pipe(
  Layer.provide([
    AccountStore.layer.pipe(Layer.provide(Hooks.LifecycleHooks.empty)),
    KeysLive,
    DeliveryLive,
    ScreeningLive,
  ]),
  Layer.provide([FetchHttpClient.layer, BunServices.layer]),
);

const Routes = Layer.merge(http.routes(), PageRoutes).pipe(Layer.provide(ApplicationLive));

const ServerLive = HttpRouter.serve(Routes, { disableLogger: true }).pipe(
  Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port })),
  Layer.provide(BunServices.layer),
);

if (import.meta.main) BunRuntime.runMain(Layer.launch(ServerLive));
