import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { AuthenticationHttp } from "@gororobas/domain"
import { Auth, Sessions } from "@yielded/auth"
import { Context, ConfigProvider, Effect, FileSystem, Layer, Path } from "effect"
import { HttpRouter } from "effect/http"

import { ApiLive } from "./api-live.js"
import { IdGenLive } from "./id-gen-live.js"
import { makeAppSql } from "./sql.js"

it.live(
  "builds implemented API groups and preserves their authentication middleware",
  Effect.fn(function* () {
    const filesystem = yield* FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer))
    const path = yield* Path.Path.pipe(Effect.provide(NodeServices.layer))
    const directory = yield* filesystem.makeTempDirectoryScoped()

    const dependencies = Layer.mergeAll(
      makeAppSql(":memory:"),
      IdGenLive,
      NodeHttpServer.layerHttpServices,
      NodeServices.layer,
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
            Layer.provide(
              Layer.succeed(
                AuthenticationHttp.RequireSession,
                AuthenticationHttp.RequireSession.of({
                  session: () => Effect.fail(Sessions.SessionInvalid.make({})),
                }),
              ),
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

    expect(profiles.status).toBe(401)
    const wiki = yield* Effect.tryPromise(() =>
      app.handler(new Request("http://localhost/wiki"), guest),
    )
    expect(wiki.status).toBe(404)
  }),
)
