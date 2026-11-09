import { type Option, Schema } from "effect"

import { ContentChannelType, ResourceFormat } from "../common/enums.js"
import { WikidataId } from "../common/external-identifiers.js"
import { MediaAssetId, WikiArticleId } from "../common/ids.js"
import { NonEmptyTrimmedString, UrlAsString } from "../common/primitives.js"
import { PartialDate } from "../common/utils/dates.js"
import { ExternalDataProvider, ProviderPhoto } from "../wiki/external-data/common.js"
import { BookEdition, BookResult } from "../wiki/external-data/kinds/book-external-data.js"
import { GbifPlantResult, WikidataResult } from "../wiki/external-data/kinds/plant-external-data.js"

export const Provider = Schema.Literals([
  ...ExternalDataProvider.literals,
  /** Writes claims when the gazetteer creates places, not through an extractor. */
  "WHOS_ON_FIRST",
  /** Hypothetical: a source we'd trust more than ourselves on strata. */
  "SYNTROPEDIA",
  /**
   * Content producers' channels (YouTube, podcast and RSS feeds…), read by a scraping workflow
   * that creates a RESOURCE article per item. Not built yet; see the implementation plan.
   */
  "CONTENT_CHANNELS",
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
 * Results today's fetchers don't return yet, and would for these properties: Wikidata's labels,
 * aliases and authors (P50), Google Books' authors per edition. Typed here so extractors can be.
 */
export const WikidataEntity = Schema.Struct({
  labels: Schema.Array(Schema.Struct({ language: Schema.String, value: NonEmptyTrimmedString })),
  aliases: Schema.Array(Schema.Struct({ language: Schema.String, value: NonEmptyTrimmedString })),
  /** In Wikidata's order, with each item's label for when we have no article for it. */
  authors: Schema.Array(Schema.Struct({ wikidataId: WikidataId, label: NonEmptyTrimmedString })),
})

export const WikidataResultWithEntity = Schema.Struct({
  ...WikidataResult.fields,
  entity: WikidataEntity,
})

export const GoogleBooksResultWithAuthors = Schema.Struct({
  ...BookResult.fields,
  editions: Schema.Array(
    Schema.Struct({ ...BookEdition.fields, authors: Schema.Array(NonEmptyTrimmedString) }),
  ),
})

/** One item a content producer's channel lists: a video, an episode, a post. */
export const ContentChannelItem = Schema.Struct({
  channelType: ContentChannelType,
  /** The channel's own ID for it: a YouTube video ID, an RSS item's GUID. */
  externalId: NonEmptyTrimmedString,
  /** The CONTENT_PRODUCER article whose channel listed it. */
  producerArticleId: WikiArticleId,
  title: NonEmptyTrimmedString,
  /** As the channel declares it; titles in other languages aren't named in ours. */
  language: Schema.NullOr(Schema.String),
  url: UrlAsString,
  format: ResourceFormat,
  publishedOn: Schema.NullOr(PartialDate),
  thumbnail: Schema.NullOr(ImportedPhoto),
})

export type ContentChannelItem = typeof ContentChannelItem.Type

/**
 * What each fetched provider returns. A property listing one of these providers among its sources
 * must say how to extract its values from this result (see `PropertyDefinition`).
 */
export interface ProviderResults {
  readonly GOOGLE_BOOKS: typeof GoogleBooksResultWithAuthors.Type
  readonly WIKIDATA: typeof WikidataResultWithEntity.Type
  readonly GBIF: typeof GbifResultWithImportedPhotos.Type
  readonly CONTENT_CHANNELS: ContentChannelItem
}

export type FetchedProvider = keyof ProviderResults

/**
 * What extraction may look up: our articles for the identifiers a result points at, loaded before
 * extracting, so extractors stay pure. A Wikidata author we have an article for becomes a link to
 * it; one we don't stays a name.
 */
export interface ExtractionContext {
  readonly articleWithWikidataId: (wikidataId: WikidataId) => Option.Option<WikiArticleId>
}
