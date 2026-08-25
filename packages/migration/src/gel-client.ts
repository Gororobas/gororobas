import { Context, Effect, Layer, Schema } from "effect"
import { createClient, type Client } from "gel"

export class GelClientError extends Schema.TaggedError<GelClientError>()("GelClientError", {
  message: Schema.String,
  error: Schema.Unknown,
}) {}

interface GelClientService {
  readonly use: <A>(operation: (client: Client) => Promise<A>) => Effect.Effect<A, GelClientError>
}

export class GelClient extends Context.Service<GelClient, GelClientService>()("GelClient") {}

const makeGelClient = Effect.sync(() => createClient()).pipe(
  Effect.map((client) => ({
    use: <A>(operation: (client: Client) => Promise<A>) =>
      Effect.tryPromise({
        try: () => operation(client),
        catch: (error) => new GelClientError({ message: "Gel client operation failed", error }),
      }).pipe(Effect.tapError(Effect.logError)),
  })),
)

export const GelClientLive = Layer.effect(GelClient, Effect.scoped(makeGelClient))
