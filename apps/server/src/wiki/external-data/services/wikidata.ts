import { WikidataId, ExternalDataFetchError } from "@gororobas/domain"
import { Context, Effect, Layer, Schema } from "effect"

import { makeProviderHttp } from "../../../common/generic-http-service.js"
import { WikidataResponse, WikidataSearchResponse } from "./wikidata.schema.js"

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
    /** Items with a statement whose value is exactly `value`, through CirrusSearch's `haswbstatement`. */
    itemsWithStatement: Effect.fn(function* (property: string, value: string) {
      const search = encodeURIComponent(`haswbstatement:"${property}=${value}"`)
      const fetched = yield* http.get(
        `/w/api.php?action=query&list=search&format=json&srlimit=10&srprop=&srsearch=${search}`,
        WikidataSearchResponse,
      )

      return fetched.value.query.search.flatMap((result) =>
        result.ns === 0 && Schema.is(WikidataId)(result.title) ? [result.title] : [],
      )
    }),
  }
})

export class Wikidata extends Context.Service<Wikidata, Effect.Success<typeof makeWikidata>>()(
  "external-data/Wikidata",
) {}

export const WikidataLive = Layer.effect(Wikidata)(makeWikidata)
