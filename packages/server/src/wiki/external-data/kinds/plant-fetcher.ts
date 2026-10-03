import {
  GbifDeprecatedSpeciesId,
  GbifTaxonId,
  Locale,
  type WikiArticleEditableData,
  type WikiArticleMaterializedRow,
  ExternalDataFetchError,
  GbifIdentifier,
  GbifPlantResult,
  WikidataResult,
  PlantExternalDataResult,
  PlantExternalDataInputs,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Predicate, Schema } from "effect"
import { Activity } from "effect/workflow"

import { Gbif } from "../services/gbif.js"
import { Wikidata } from "../services/wikidata.js"

export const fetchPlantGbif = Effect.fn(function* (identifier: GbifIdentifier) {
  const gbif = yield* Gbif
  const taxonId: GbifTaxonId = yield* gbif.resolveTaxonId(identifier)
  const taxonomy = yield* gbif.taxonMetadata({ kind: "taxon", id: taxonId })

  const images = yield* gbif.occurrences({ taxonId, limit: 20, mediaType: "StillImage" })

  return GbifPlantResult.make({
    gbifTaxonId: taxonId,
    taxonomyGroup: taxonomy.value.taxonomicGroup ?? null,
    classification: taxonomy.value.classification.map((taxon) => ({
      taxonId: taxon.taxonId,
      scientificName: taxon.scientificName,
      taxonRank: taxon.taxonRank,
    })),
    media: images.value.results.flatMap((occurrence) =>
      (occurrence.media ?? [])
        .filter((media) => media.type === "StillImage")
        .map((media) => ({
          mediaUrl: media.identifier,
          sourceUrl: `https://www.gbif.org/occurrence/${occurrence.key}`,
          creditLine: EffectArray.dedupe(
            [media.creator, media.rightsHolder].filter(
              (value): value is string => value !== undefined,
            ),
          ).join(" · "),
          licenseUrl: media.license ?? null,
        })),
    ),
  })
})

export const fetchPlantWikidata = Effect.fn(function* (wikidataId: string) {
  const wikidata = yield* Wikidata
  const fetched = yield* wikidata.entity(wikidataId)
  const currentClaims = (fetched.value.claims.P14607 ?? []).filter(
    (claim) => claim.rank !== "deprecated" && claim.mainsnak.snaktype === "value",
  )
  const legacyClaims = (fetched.value.claims.P846 ?? []).filter(
    (claim) => claim.rank !== "deprecated" && claim.mainsnak.snaktype === "value",
  )
  const hasCurrentClaims = EffectArray.isReadonlyArrayNonEmpty(currentClaims)
  const claims = hasCurrentClaims ? currentClaims : legacyClaims
  const identifierSchema = hasCurrentClaims ? GbifTaxonId : GbifDeprecatedSpeciesId
  const preferred = claims.filter((claim) => claim.rank === "preferred")
  const identifiers = EffectArray.dedupe(
    (EffectArray.isReadonlyArrayNonEmpty(preferred) ? preferred : claims).flatMap((claim) =>
      Predicate.isString(claim.mainsnak.datavalue?.value) &&
      Schema.is(identifierSchema)(claim.mainsnak.datavalue.value)
        ? [claim.mainsnak.datavalue.value]
        : [],
    ),
  )

  if (identifiers.length > 1) {
    return yield* new ExternalDataFetchError({
      provider: "WIKIDATA",
      message: "Ambiguous GBIF identifiers",
      retryable: false,
    })
  }

  return WikidataResult.make({
    observation: fetched.observation,
    gbifId: EffectArray.isReadonlyArrayNonEmpty(identifiers)
      ? {
          kind: hasCurrentClaims ? "taxon" : "deprecated-species",
          id: identifiers[0],
        }
      : null,
    wikipediaLinks: Locale.literals.flatMap((locale) => {
      const link = fetched.value.sitelinks[`${locale}wiki`]
      return link ? [{ locale, url: link.url }] : []
    }),
  })
})

export const fetchPlant = Effect.fn(function* (inputs: typeof PlantExternalDataInputs.Type) {
  if (Option.isNone(inputs.wikidataId))
    return PlantExternalDataResult.make({
      kind: "PLANT",
      attributes: { wikidata: null, gbif: null },
    })

  const wikidata = yield* Activity.make({
    name: "wikidata",
    success: WikidataResult,
    error: ExternalDataFetchError,
    execute: fetchPlantWikidata(inputs.wikidataId.value),
  }).pipe(Activity.retry({ times: 2, while: (error) => error.retryable }))

  const gbif =
    wikidata.gbifId === null
      ? null
      : yield* Activity.make({
          name: "gbif",
          success: GbifPlantResult,
          error: ExternalDataFetchError,
          execute: fetchPlantGbif(wikidata.gbifId),
        }).pipe(Activity.retry({ times: 2, while: (error) => error.retryable }), Effect.result)

  return PlantExternalDataResult.make({ kind: "PLANT", attributes: { wikidata, gbif } })
})

export const plantToExternalDataInputs = (
  article: Extract<WikiArticleEditableData | WikiArticleMaterializedRow, { kind: "PLANT" }>,
): typeof PlantExternalDataInputs.Type => ({
  kind: "PLANT",
  wikidataId: article.attributes.wikidataId,
})
