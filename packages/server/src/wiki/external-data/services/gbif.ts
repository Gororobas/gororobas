import { GbifTaxonId, ExternalDataFetchError, type GbifIdentifier } from "@gororobas/domain"
import { Context, Effect, Layer } from "effect"

import { makeProviderHttp } from "../../../common/generic-http-service.js"
import { TaxonMetadata, SpeciesMatch, GbifOccurrences } from "./gbif.schema.js"

// oxlint-disable-next-line custom-lint-rules/no-direct-id-construction -- This is GBIF's published checklist identifier, not an application-generated ID.
const CALENDAR_OF_LIFE_CHECKLIST_KEY = "7ddf754f-d193-4cc9-b351-99906754a03b"

export const makeGbif = Effect.gen(function* () {
  const http = yield* makeProviderHttp("GBIF", "https://api.gbif.org")

  const resolveTaxonId = (identifier: GbifIdentifier) =>
    identifier.kind === "taxon"
      ? Effect.succeed(identifier.id)
      : http
          .get(
            `/v2/species/match?checklistKey=${CALENDAR_OF_LIFE_CHECKLIST_KEY}&taxonID=${encodeURIComponent(`gbif:${identifier.id}`)}`,
            SpeciesMatch,
          )
          .pipe(
            Effect.flatMap(({ value }) =>
              value.usage
                ? Effect.succeed(value.usage.key)
                : Effect.fail(
                    new ExternalDataFetchError({
                      provider: "GBIF",
                      message: "Deprecated GBIF species ID has no Catalogue of Life match",
                      retryable: false,
                    }),
                  ),
            ),
          )

  return {
    resolveTaxonId,
    taxonMetadata: (identifier: GbifIdentifier) =>
      Effect.flatMap(resolveTaxonId(identifier), (taxonId) =>
        http.get(
          `/v2/experimental/taxon/${CALENDAR_OF_LIFE_CHECKLIST_KEY}/${taxonId}/info`,
          TaxonMetadata,
        ),
      ),
    occurrences: (input: { taxonId: GbifTaxonId; limit: number; mediaType?: string }) => {
      const query = `taxonKey=${encodeURIComponent(input.taxonId)}&checklistKey=${CALENDAR_OF_LIFE_CHECKLIST_KEY}&limit=${input.limit}`
      const media = input.mediaType ? `&mediaType=${encodeURIComponent(input.mediaType)}` : ""
      return http.get(`/v1/occurrence/search?${query}${media}`, GbifOccurrences)
    },
  }
})

export class Gbif extends Context.Service<Gbif, Effect.Success<typeof makeGbif>>()(
  "external-data/Gbif",
) {}
export const GbifLive = Layer.effect(Gbif)(makeGbif)
