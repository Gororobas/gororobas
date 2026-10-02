import { WikidataId, ExternalDataFetchError } from "@gororobas/domain"
import { Context, Effect, Layer } from "effect"

import { makeProviderHttp } from "../../../common/generic-http-service.js"
import { WikidataResponse } from "./wikidata.schema.js"

export const makeWikidata = Effect.gen(function* () {
  const http = yield* makeProviderHttp("WIKIDATA", "https://www.wikidata.org")

  return {
    entity: Effect.fn(function* (id: WikidataId) {
      const fetched = yield* http.get(`/wiki/Special:EntityData/${id}.json`, WikidataResponse)
      const entity = fetched.value.entities[id]

      if (!entity) {
        return yield* new ExternalDataFetchError({
          provider: "WIKIDATA",
          message: "Entity not found or redirected; review identity",
          retryable: false,
        })
      }

      return { value: entity, observation: { ...fetched.observation, externalId: id } }
    }),
  }
})

export class Wikidata extends Context.Service<Wikidata, Effect.Success<typeof makeWikidata>>()(
  "external-data/Wikidata",
) {}

export const WikidataLive = Layer.effect(Wikidata)(makeWikidata)
