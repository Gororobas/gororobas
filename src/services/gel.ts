import { Context, Data, Effect, Layer } from 'effect'
import { type Client, createClient } from 'gel'
import { GEL_CONNECTION_OPTIONS } from '@/gel'

export class GelError extends Data.TaggedError('GelError')<{
  cause?: unknown
  message?: string
}> {}

interface GelImpl {
  use: <T>(
    fn: (client: Client) => T,
  ) => Effect.Effect<Awaited<T>, GelError, never>
}
export class Gel extends Context.Tag('Gel')<Gel, GelImpl>() {}

type GelClientOptions = Parameters<typeof createClient>[0]

const make = (options: GelClientOptions) =>
  Effect.gen(function* () {
    const client = createClient(options)

    return Gel.of({
      use: (fn) =>
        Effect.gen(function* () {
          const result = yield* Effect.try({
            try: () => fn(client),
            catch: (e) =>
              new GelError({
                cause: e,
                message: 'Syncronous error in `Gel.use`',
              }),
          })
          if (result instanceof Promise) {
            return yield* Effect.tryPromise({
              try: () => result,
              catch: (e) =>
                new GelError({
                  cause: e,
                  message: 'Asyncronous error in `Gel.use`',
                }),
            })
          }

          return result
        }).pipe(
          Effect.tapError((error) =>
            Effect.logDebug('Gel.use failed', error.cause),
          ),
        ),
    })
  })

export const layer = Layer.scoped(
  Gel,
  make(GEL_CONNECTION_OPTIONS),
)
