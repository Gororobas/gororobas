import { Schema } from "effect"

import { MediaAssetId } from "../common/ids.js"
import { ExternalDataProvider, ProviderPhoto } from "../wiki/external-data/common.js"
import { BookResult } from "../wiki/external-data/kinds/book-external-data.js"
import { GbifPlantResult, WikidataResult } from "../wiki/external-data/kinds/plant-external-data.js"

export const Provider = Schema.Literals([
  ...ExternalDataProvider.literals,
  /** Writes claims when the gazetteer creates places, not through an extractor. */
  "WHOS_ON_FIRST",
  /** Hypothetical: a source we'd trust more than ourselves on strata. */
  "SYNTROPEDIA",
])

export type Provider = typeof Provider.Type

/**
 * A provider's photo once it's imported into a media asset, as the external data fetch does
 * before persisting: served from our storage at every size, with its credits and license.
 * Extractors only ever see imported photos, so image claims always point at media assets.
 */
export const ImportedPhoto = Schema.Struct({
  ...ProviderPhoto.fields,
  mediaAssetId: MediaAssetId,
})

export type ImportedPhoto = typeof ImportedPhoto.Type

/** GBIF's result with its photos imported: what extractors read. */
export const GbifResultWithImportedPhotos = Schema.Struct({
  ...GbifPlantResult.fields,
  photos: Schema.Array(ImportedPhoto),
})

/**
 * What each fetched provider returns. A property listing one of these providers among its sources
 * must say how to extract its values from this result (see `PropertyDefinition`).
 */
export interface ProviderResults {
  readonly GOOGLE_BOOKS: typeof BookResult.Type
  readonly WIKIDATA: typeof WikidataResult.Type
  readonly GBIF: typeof GbifResultWithImportedPhotos.Type
}

export type FetchedProvider = keyof ProviderResults
