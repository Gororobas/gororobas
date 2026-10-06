import { NodePath, NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { makeAppSqlClient } from "@gororobas/server/sql"
import { Effect, Layer, Path } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
// oxlint-disable-next-line effect/use-http-client-service -- NodeHttpServer requires the Node HTTP server factory.
// oxlint-disable-next-line custom-lint-rules/no-node-apis -- NodeHttpServer.layer requires the Node HTTP server factory.
import { createServer } from "node:http"

import { readPreviewDataset } from "./preview-dataset.js"

const { join, resolve } = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

export const makePreviewRoutes = (previewDirectory: string) => {
  const handle = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    if (request.method !== "GET") {
      return HttpServerResponse.text("Read-only preview", { status: 405 })
    }

    if (request.url === "/exports.json") {
      return yield* readPreviewDataset(previewDirectory).pipe(
        Effect.flatMap(HttpServerResponse.json),
      )
    }

    if (request.url === "/") {
      return yield* HttpServerResponse.file(
        new URL("../preview/index.html", import.meta.url).pathname,
      )
    }

    const mediaAsset = /^\/stored-media-assets\/([a-f0-9-]{36})\/(50|300|1280|2400)\.webp$/.exec(
      request.url,
    )

    if (mediaAsset) {
      return yield* HttpServerResponse.file(
        join(previewDirectory, "media-assets", mediaAsset[1], `${mediaAsset[2]}.webp`),
      ).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 404 }))))
    }

    return HttpServerResponse.text("Not found", { status: 404 })
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logError(cause).pipe(
        Effect.as(HttpServerResponse.text("Cannot load preview database", { status: 500 })),
      ),
    ),
    Effect.map((response) => HttpServerResponse.setHeader(response, "Cache-Control", "no-store")),
  )

  return HttpRouter.add("*", "/*", handle)
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const directory = process.env.SQLITE_PREVIEW_DIRECTORY
  if (!directory) {
    throw new Error("Set SQLITE_PREVIEW_DIRECTORY to a completed preview:sqlite import directory")
  }
  const previewDirectory = resolve(directory)
  const server = NodeHttpServer.layer(createServer, {
    port: Number(process.env.PORT ?? 5173),
    host: "127.0.0.1",
  })
  const routes = makePreviewRoutes(previewDirectory)

  Layer.launch(
    HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
      Layer.provide(
        Layer.effectDiscard(
          HttpServer.addressFormattedWith((address) =>
            Effect.sync(() => console.log(`Migration preview: ${address}`)),
          ),
        ),
      ),
      Layer.provide(server),
      Layer.provide(makeAppSqlClient(join(previewDirectory, "preview.sqlite"), true)),
      Layer.provide(NodeServices.layer),
    ),
  ).pipe(NodeRuntime.runMain)
}
