import { Schema, Struct } from "effect"

import { GbifDeprecatedSpeciesId, GbifTaxonId } from "../../../common/external-identifiers.js"
import { WikiPlantArticle } from "../../kinds/plant.js"
import { ExternalLink, ExternalMedia, Observation } from "../common.js"
import { ExternalDataFetchError } from "../error.js"

export const GbifIdentifier = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("taxon"), id: GbifTaxonId }),
  Schema.Struct({ kind: Schema.Literal("deprecated-species"), id: GbifDeprecatedSpeciesId }),
])
export type GbifIdentifier = typeof GbifIdentifier.Type

export const WikidataResult = Schema.Struct({
  observation: Observation,
  gbifId: Schema.NullOr(GbifIdentifier),
  wikipediaLinks: Schema.Array(ExternalLink),
})

export const GbifClassification = Schema.Struct({
  taxonId: Schema.String,
  scientificName: Schema.String,
  taxonRank: Schema.String,
})

export const GbifPlantResult = Schema.Struct({
  gbifTaxonId: GbifTaxonId,
  taxonomyGroup: Schema.NullOr(Schema.String),
  classification: Schema.Array(GbifClassification),
  media: Schema.Array(ExternalMedia),
})

export const PlantExternalDataInputs = Schema.Struct({
  kind: Schema.Literal("PLANT"),
  ...WikiPlantArticle.EditableAttributes.mapFields(Struct.pick(["wikidataId"])).fields,
})

export const PlantExternalDataResult = Schema.Struct({
  kind: Schema.Literal("PLANT"),
  attributes: Schema.Struct({
    wikidata: Schema.NullOr(WikidataResult),
    gbif: Schema.NullOr(Schema.Result(GbifPlantResult, ExternalDataFetchError)),
  }),
})

export type PlantExternalDataResult = typeof PlantExternalDataResult.Type
