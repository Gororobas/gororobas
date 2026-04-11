import { DurableStreamTestServer } from "@durable-streams/server"
import { Context, Effect, Layer, Schema } from "effect"

export class DurableStreamServerError extends Schema.TaggedErrorClass<DurableStreamServerError>()(
  "DurableStreamServerError",
  {
    message: Schema.String,
  },
) {}

export interface DurableStreamsConfig {
  readonly dataDir: string
}

export interface DurableStreamsService {
  readonly internalUrl: string
  readonly server: DurableStreamTestServer
}

export const DurableStreamsService = Context.Service<DurableStreamsService>("DurableStreamsService")

export const DurableStreamsServiceLive = (config: DurableStreamsConfig) =>
  Layer.effect(DurableStreamsService)(
    Effect.gen(function* () {
      const server = new DurableStreamTestServer({
        dataDir: config.dataDir,
        port: 0,
        host: "127.0.0.1",
      })

      const internalUrl = yield* Effect.tryPromise({
        try: () => server.start(),
        catch: (error) =>
          new DurableStreamServerError({
            message: `Failed to start durable stream server: ${String(error)}`,
          }),
      })

      yield* Effect.log("Durable stream server started", { internalUrl })

      yield* Effect.addFinalizer(() =>
        Effect.tryPromise({
          try: () => server.stop(),
          catch: () => void 0,
        }).pipe(
          Effect.tap(() => Effect.log("Durable stream server stopped")),
          Effect.ignore,
        ),
      )

      return { internalUrl, server }
    }),
  )
