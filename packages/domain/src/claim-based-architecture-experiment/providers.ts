import { Schema } from "effect"

import { MediaAssetId } from "../common/ids.js"
import { ExternalDataProvider, ExternalMedia } from "../wiki/external-data/common.js"
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
 * A provider's photo, downloaded into a media asset before any claim points at it, so it's served
 * from our servers at every size like uploads are. The fetch downloads each photo once, keyed by
 * its source URL, and the asset keeps the credit line, source and license.
 */
export const DownloadedMedia = Schema.Struct({
  ...ExternalMedia.fields,
  mediaAssetId: MediaAssetId,
})

export type DownloadedMedia = typeof DownloadedMedia.Type

/** GBIF's result once its photos are downloaded: what extractors read. */
export const GbifResultWithDownloadedMedia = Schema.Struct({
  ...GbifPlantResult.fields,
  media: Schema.Array(DownloadedMedia),
})

/**
 * What each fetched provider returns. A property listing one of these providers among its sources
 * must say how to extract its values from this result (see `PropertyDefinition`).
 */
export interface ProviderResults {
  readonly GOOGLE_BOOKS: typeof BookResult.Type
  readonly WIKIDATA: typeof WikidataResult.Type
  readonly GBIF: typeof GbifResultWithDownloadedMedia.Type
}

export type FetchedProvider = keyof ProviderResults
