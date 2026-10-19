import { GororobasApi } from "@gororobas/domain/apis"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientError } from "effect/http"
import { HttpApiClient } from "effect/http-api"

import { SessionAccess, sessionAccessLayer } from "./session-access"

export const API_BASE_PATH = "/api"

export const makeClient = Effect.gen(function* () {
  const access = yield* SessionAccess

  return yield* HttpApiClient.make(GororobasApi, {
    baseUrl: API_BASE_PATH,
    transformClient: HttpClient.transform((response, request) =>
      Effect.gen(function* () {
        yield* access.flushSignOut.pipe(
          Effect.mapError(
            () =>
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  request,
                  description: "Sign-out must finish before continuing.",
                }),
              }),
          ),
        )

        const identity = access.read().identity

        if (identity !== null) {
          yield* access.ensureReady(identity.subjectId).pipe(
            Effect.mapError(
              () =>
                new HttpClientError.HttpClientError({
                  reason: new HttpClientError.TransportError({
                    request,
                    description: "Session must be verified before continuing.",
                  }),
                }),
            ),
          )
        }

        const result = yield* response.pipe(Effect.tapError(() => access.connectionChanged))
        if (result.status === 401) yield* access.reject
        return result
      }),
    ),
  })
})

export class GororobasApiClient extends Context.Service<
  GororobasApiClient,
  Effect.Success<typeof makeClient>
>()("GororobasApiClient") {}

export const resources = Layer.effect(
  GororobasApiClient,
  makeClient.pipe(Effect.provide(FetchHttpClient.layer)),
).pipe(Layer.provide(sessionAccessLayer))
