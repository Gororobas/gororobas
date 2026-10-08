import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Auth } from "@yielded/auth"
import { Context, ConfigProvider, Effect, FileSystem, Layer, Path } from "effect"
import { HttpRouter } from "effect/http"
import { WorkflowEngine } from "effect/workflow"

import {
  authenticationTestOrigin,
  authenticationTestBindingKey,
  captureEmailDelivery,
} from "../test/authentication-helpers.js"
import { ApiLive } from "./api-live.js"
import { makeAuthentication } from "./authentication/app-auth.js"
import { authenticationLayer } from "./authentication/authentication-live.js"
import { IdGenLive } from "./id-gen-live.js"
import { makeAppSql } from "./sql.js"

it.live(
  "authenticates visitors without blocking public endpoints and lets policies deny uploads",
  Effect.fn(function* () {
    const filesystem = yield* FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer))
    const path = yield* Path.Path.pipe(Effect.provide(NodeServices.layer))
    const directory = yield* filesystem.makeTempDirectoryScoped()

    const dependencies = Layer.mergeAll(
      makeAppSql(":memory:"),
      IdGenLive,
      NodeHttpServer.layerHttpServices,
      NodeServices.layer,
      WorkflowEngine.layerMemory,
      Layer.succeed(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          MEDIA_ASSETS_DIRECTORY: path.join(directory, "media"),
        }),
      ),
    )

    const app = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(
          ApiLive.pipe(
            makeAuthentication(authenticationTestOrigin).http.middleware,
            Layer.provide(
              authenticationLayer({
                origin: authenticationTestOrigin,
                requestBindingKey: authenticationTestBindingKey,
              }).pipe(Layer.provide(captureEmailDelivery().layer)),
            ),
            HttpRouter.provideRequest(dependencies),
            Layer.provideMerge(dependencies),
          ),
          { disableLogger: true },
        ),
      ),
      (app) => Effect.tryPromise(() => app.dispose()).pipe(Effect.orDie),
    )

    const guest = Context.make(Auth.AuthRequest, {
      invocation: { _tag: "Guest" },
      credentials: {},
      credentialCommandSink: () => Effect.void,
    })

    const profiles = yield* Effect.tryPromise(() =>
      app.handler(
        new Request("http://localhost/profiles/handle-availability?handle=reviewer"),
        guest,
      ),
    )

    expect(profiles.status).toBe(200)

    const deniedUpload = yield* Effect.tryPromise(() =>
      app.handler(
        new Request("http://localhost/media/upload", {
          method: "POST",
          headers: { "content-type": "multipart/form-data; boundary=empty" },
          body: "--empty--",
        }),
        guest,
      ),
    )

    expect(deniedUpload.status).toBe(403)
    const wiki = yield* Effect.tryPromise(() =>
      app.handler(new Request("http://localhost/wiki"), guest),
    )
    expect(wiki.status).toBe(404)
  }),
)
