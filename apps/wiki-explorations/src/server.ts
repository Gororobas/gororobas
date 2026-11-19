import { NodeFileSystem, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, FileSystem, Layer, Order, Schema, Semaphore } from "effect"
import { sort } from "effect/Array"
import { HttpRouter, HttpServerResponse } from "effect/http"
// oxlint-disable-next-line effect/avoid-node-imports, custom-lint-rules/no-node-apis -- Hash the stored bytes for optimistic concurrency.
import { createHash } from "node:crypto"
// oxlint-disable-next-line effect/use-http-client-service, custom-lint-rules/no-node-apis -- NodeHttpServer needs the Node HTTP factory.
import { createServer } from "node:http"
// oxlint-disable-next-line effect/avoid-node-imports, custom-lint-rules/no-node-apis -- Resolve the checked-in canvas directory relative to this module.
import { fileURLToPath } from "node:url"

import { Canvas, inspectGraph } from "./graph.js"

const directory = fileURLToPath(new URL("../canvases/", import.meta.url))
const CanvasFile = Schema.fromJsonString(Canvas, { space: 2 })
const CreateCanvas = Schema.Struct({
  title: Schema.NonEmptyString,
  from: Schema.optional(Schema.String),
})
const CanvasEdit = Schema.Struct({ revision: Schema.String, canvas: Canvas })

const revisionOf = (content: string) => createHash("sha256").update(content).digest("hex")
const problem = (status: number, error: string) =>
  HttpServerResponse.jsonUnsafe({ error }, { status })

const routes = HttpRouter.addAll(
  Effect.gen(function* () {
    const files = yield* FileSystem.FileSystem
    const writes = yield* Semaphore.make(1)
    yield* files.makeDirectory(directory, { recursive: true })

    const validId = (id: string | undefined): id is string =>
      /^[a-z0-9][a-z0-9-]{0,90}$/.test(id ?? "")
    const pathFor = (id: string) => `${directory}${id}.json`

    const read = (id: string) =>
      Effect.gen(function* () {
        const path = pathFor(id)
        if (!(yield* files.exists(path))) {
          return yield* Effect.fail(problem(404, "Canvas not found."))
        }
        const content = yield* files.readFileString(path)
        const canvas = yield* Schema.decodeEffect(CanvasFile)(content)
        return { id, revision: revisionOf(content), canvas }
      })

    const write = (id: string, canvas: Canvas) =>
      Effect.gen(function* () {
        const path = pathFor(id)
        const temporary = `${path}.writing`
        const content = (yield* Schema.encodeEffect(CanvasFile)(canvas)) + "\n"
        yield* files.writeFileString(temporary, content)
        yield* files.rename(temporary, path)
        return { id, revision: revisionOf(content), canvas }
      }).pipe(Effect.uninterruptible)

    const storageError = Effect.catch((error) => {
      if (HttpServerResponse.isHttpServerResponse(error)) return Effect.succeed(error)
      return Effect.logError(error).pipe(
        Effect.as(problem(500, "Could not access canvas storage.")),
      )
    })

    return [
      HttpRouter.route(
        "GET",
        "/api/canvases",
        Effect.gen(function* () {
          const names = yield* files.readDirectory(directory)
          const ids = names
            .filter((name) => name.endsWith(".json"))
            .map((name) => name.slice(0, -5))

          const entries = yield* Effect.forEach(
            sort(ids.filter(validId), Order.String),
            (id) =>
              read(id).pipe(
                Effect.map(({ canvas }) => ({
                  id,
                  title: canvas.title,
                  forkedFrom: canvas.forkedFrom,
                })),
              ),
            { concurrency: 1 },
          )

          return HttpServerResponse.jsonUnsafe(entries)
        }).pipe(storageError),
      ),
      HttpRouter.route(
        "GET",
        "/api/canvases/:id",
        Effect.gen(function* () {
          const { id } = yield* HttpRouter.params
          if (!validId(id)) return problem(404, "Canvas not found.")
          return HttpServerResponse.jsonUnsafe(yield* read(id))
        }).pipe(storageError),
      ),
      HttpRouter.route(
        "GET",
        "/api/canvases/:id/flow",
        Effect.gen(function* () {
          const { id } = yield* HttpRouter.params
          if (!validId(id)) return problem(404, "Canvas not found.")
          const { canvas, revision } = yield* read(id)

          return HttpServerResponse.jsonUnsafe({
            id,
            title: canvas.title,
            revision,
            ...inspectGraph(canvas),
          })
        }).pipe(storageError),
      ),
      HttpRouter.route("POST", "/api/canvases", (request) =>
        writes
          .withPermit(
            Effect.gen(function* () {
              if (request.headers["x-wiki-explorations"] !== "1") {
                return problem(403, "Missing workspace header.")
              }

              const payload = yield* request.json.pipe(
                // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP JSON is untrusted.
                Effect.flatMap(Schema.decodeUnknownEffect(CreateCanvas)),
                Effect.mapError(() =>
                  problem(400, "Provide a title and an optional source canvas ID."),
                ),
              )

              const title = payload.title.trim()
              if (!title) return problem(400, "Give the canvas a title.")

              const base =
                title
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                  .slice(0, 70) || "canvas"

              let id = base
              // oxlint-disable-next-line effect/imperative-loops, effect/yield-in-for-loop -- Check each candidate until an unused path is found.
              for (let suffix = 2; yield* files.exists(pathFor(id)); suffix++) {
                id = `${base}-${suffix}`
              }

              if (payload.from !== undefined && !validId(payload.from)) {
                return problem(404, "Source canvas not found.")
              }
              const canvas =
                payload.from === undefined
                  ? { title, nodes: [], edges: [] }
                  : { ...(yield* read(payload.from)).canvas, title, forkedFrom: payload.from }
              const { errors } = inspectGraph(canvas)
              if (errors.length) return problem(422, errors.join(" "))
              return HttpServerResponse.jsonUnsafe(yield* write(id, canvas), { status: 201 })
            }),
          )
          .pipe(storageError),
      ),
      HttpRouter.route("PUT", "/api/canvases/:id", (request) =>
        writes
          .withPermit(
            Effect.gen(function* () {
              if (request.headers["x-wiki-explorations"] !== "1") {
                return problem(403, "Missing workspace header.")
              }

              const { id } = yield* HttpRouter.params
              if (!validId(id)) return problem(404, "Canvas not found.")

              const payload = yield* request.json.pipe(
                // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP JSON is untrusted.
                Effect.flatMap(Schema.decodeUnknownEffect(CanvasEdit)),
                Effect.mapError(() => problem(400, "Provide a valid canvas and its revision.")),
              )

              const current = yield* read(id)
              if (current.revision !== payload.revision) {
                return problem(409, "Canvas changed on disk. Reload before editing it again.")
              }
              const { errors } = inspectGraph(payload.canvas)
              if (errors.length) return problem(422, errors.join(" "))
              return HttpServerResponse.jsonUnsafe(yield* write(id, payload.canvas))
            }),
          )
          .pipe(storageError),
      ),
    ]
  }),
)

const server = Layer.unwrap(
  Config.Port("WIKI_EXPLORATIONS_PORT").pipe(
    Config.withDefault(4561),
    Effect.map((port) => NodeHttpServer.layer(createServer, { host: "127.0.0.1", port })),
  ),
)

HttpRouter.serve(routes).pipe(
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(server),
  Layer.launch,
  NodeRuntime.runMain,
)
