import { GororobasApi } from "@gororobas/domain/apis"
import { csrfProtection } from "@gororobas/domain/authentication/auth-contract"
import { EXPECTED_SUBJECT_HEADER } from "@gororobas/domain/authentication/middleware"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"

import { SessionAccess, sessionAccessLayer } from "./session-access"

export const API_BASE_PATH = "/api"

const SAFE_METHODS: ReadonlyArray<string> = ["GET", "HEAD", "OPTIONS"]

const notReady = (request: HttpClientRequest.HttpClientRequest, description: string) =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({ request, description }),
  })

export const makeClient = Effect.gen(function* () {
  const access = yield* SessionAccess

  return yield* HttpApiClient.make(GororobasApi, {
    baseUrl: API_BASE_PATH,
    transformClient: (client) =>
      client.pipe(
        HttpClient.mapRequestEffect((request) =>
          Effect.gen(function* () {
            yield* access.flushSignOut.pipe(
              Effect.mapError(() => notReady(request, "Sign-out must finish before continuing.")),
            )

            const identity = access.read().identity

            if (identity !== null) {
              yield* access
                .ensureReady(identity.subjectId)
                .pipe(
                  Effect.mapError(() =>
                    notReady(request, "Session must be verified before continuing."),
                  ),
                )
            }

            if (SAFE_METHODS.includes(request.method)) return request

            const write = HttpClientRequest.setHeader(
              request,
              csrfProtection.header,
              csrfProtection.value,
            )

            // The server refuses the write if the cookie now belongs to another account.
            return identity === null
              ? write
              : HttpClientRequest.setHeader(write, EXPECTED_SUBJECT_HEADER, identity.subjectId)
          }),
        ),
        HttpClient.transform((response) =>
          Effect.gen(function* () {
            const result = yield* response.pipe(Effect.tapError(() => access.connectionChanged))
            if (result.status === 401) yield* access.reject
            return result
          }),
        ),
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
