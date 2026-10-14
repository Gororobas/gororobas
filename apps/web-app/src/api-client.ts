import { GororobasApi } from "@gororobas/domain/apis"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"

export const API_BASE_PATH = "/api"

const makeClient = HttpApiClient.make(GororobasApi, { baseUrl: API_BASE_PATH })

export class GororobasApiClient extends Context.Service<
  GororobasApiClient,
  Effect.Success<typeof makeClient>
>()("GororobasApiClient") {}

export const resources = Layer.effect(
  GororobasApiClient,
  makeClient.pipe(Effect.provide(FetchHttpClient.layer)),
)
