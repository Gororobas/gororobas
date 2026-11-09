import { Schema } from "effect"

import {
  GbifDeprecatedSpeciesId,
  GbifTaxonId,
  WikidataId,
} from "../../../common/external-identifiers.js"
import { MediaAssetId } from "../../../common/ids.js"
import { OptionalColumn } from "../../../common/primitives.js"
import { ExternalLink, Observation, ProviderPhoto } from "../common.js"
import { ExternalDataFetchError } from "../error.js"

export const GbifIdentifier = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("taxon"), id: GbifTaxonId }),
  Schema.Struct({ kind: Schema.Literal("deprecated-species"), id: GbifDeprecatedSpeciesId }),
])
export type GbifIdentifier = typeof GbifIdentifier.Type

export const WikidataResult = Schema.Struct({
  observation: Observation,
  gbifId: Schema.NullOr(GbifIdentifier),
  /** The item's taxon name (P225), for matching taxa whose GBIF ID is outdated. */
  taxonName: Schema.NullOr(Schema.String),
  wikipediaLinks: Schema.Array(ExternalLink),
})

/** One rank of a taxon's classification, such as its family. */
export const GbifClassification = Schema.Struct({
  taxonId: Schema.String,
  scientificName: Schema.String,
  taxonRank: Schema.String,
})

export type GbifClassification = typeof GbifClassification.Type

export const GbifPlantResult = Schema.Struct({
  observations: Schema.Array(Observation),
  gbifTaxonId: GbifTaxonId,
  taxonomyGroup: Schema.NullOr(Schema.String),
  classification: Schema.Array(GbifClassification),
  photos: Schema.Array(ProviderPhoto),
})

/**
 * Typed as `WikiPlantArticle`'s editable attributes. It's not picked from it because the kind's
 * definition depends on this module, through the page data.
 */
export const PlantExternalDataInputs = Schema.Struct({
  kind: Schema.Literal("PLANT"),
  wikidataId: OptionalColumn(WikidataId),
})

export const PlantExternalDataResult = Schema.Struct({
  kind: Schema.Literal("PLANT"),
  attributes: Schema.Struct({
    wikidata: Schema.NullOr(Schema.Result(WikidataResult, ExternalDataFetchError)),
    gbif: Schema.NullOr(Schema.Result(GbifPlantResult, ExternalDataFetchError)),
    /**
     * GBIF's photos as our media assets, in its order. Photos that couldn't be imported are left
     * out; empty unless GBIF succeeded.
     */
    gbifPhotos: Schema.Array(MediaAssetId),
  }),
})

export type PlantExternalDataResult = typeof PlantExternalDataResult.Type
