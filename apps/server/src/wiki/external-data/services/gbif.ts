import { GbifTaxonId, ExternalDataFetchError, type GbifIdentifier } from "@gororobas/domain"
import { Context, Effect, Layer, Option } from "effect"

import { makeProviderHttp } from "../../../common/generic-http-service.js"
import { TaxonMetadata, SpeciesMatch, GbifOccurrences } from "./gbif.schema.js"

// oxlint-disable-next-line custom-lint-rules/no-direct-id-construction -- This is GBIF's published checklist identifier, not an application-generated ID.
const CALENDAR_OF_LIFE_CHECKLIST_KEY = "7ddf754f-d193-4cc9-b351-99906754a03b"

export const makeGbif = Effect.gen(function* () {
  const http = yield* makeProviderHttp("GBIF", "https://api.gbif.org")

  const speciesMatch = (query: string) =>
    Effect.map(
      http.get(
        `/v2/species/match?checklistKey=${CALENDAR_OF_LIFE_CHECKLIST_KEY}&${query}`,
        SpeciesMatch,
      ),
      ({ value }) => ({
        taxonId: Option.fromNullishOr(value.acceptedUsage?.key ?? value.usage?.key),
        isExact: value.diagnostics?.matchType === "EXACT",
      }),
    )

  /**
   * Taxa Wikidata still identifies by a GBIF Backbone species ID (P846) are matched to Catalogue
   * of Life through that ID, or else through Wikidata's exact taxon name. Fuzzy name matches are
   * rejected, as they can be another species of the same genus. Synonyms resolve to their
   * accepted taxon.
   */
  const resolveTaxonId = Effect.fn("Gbif.resolveTaxonId")(function* (
    identifier: GbifIdentifier,
    taxonName: string | null = null,
  ) {
    if (identifier.kind === "taxon") return identifier.id

    const byId = yield* speciesMatch(`taxonID=${encodeURIComponent(`gbif:${identifier.id}`)}`)
    if (Option.isSome(byId.taxonId)) return byId.taxonId.value

    if (taxonName !== null) {
      const byName = yield* speciesMatch(`scientificName=${encodeURIComponent(taxonName)}`)
      if (byName.isExact && Option.isSome(byName.taxonId)) return byName.taxonId.value
    }

    return yield* new ExternalDataFetchError({
      provider: "GBIF",
      message: `Deprecated GBIF species ID ${identifier.id} has no Catalogue of Life match${taxonName === null ? "" : `, nor an exact match for ${taxonName}`}`,
      retryable: false,
    })
  })

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
