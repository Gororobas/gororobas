import { Schema } from "effect"

import { ContentChannelType, ResourceFormat } from "../../common/enums.js"
import { MediaAssetId, WikiArticleId } from "../../common/ids.js"
import { NonEmptyTrimmedString, UrlAsString } from "../../common/primitives.js"
import { PartialDate } from "../../common/utils/dates.js"
import { ExternalDataProvider, ProviderPhoto } from "../../wiki/external-data/common.js"
import { BookEdition, BookResult } from "../../wiki/external-data/kinds/book-external-data.js"
import { GbifPlantResult } from "../../wiki/external-data/kinds/plant-external-data.js"
import type { SyntropediaPlant } from "./syntropedia.js"
import type { TmdbWork } from "./tmdb.js"
import type { WhosOnFirstPlace } from "./whos-on-first.js"
import type { WikidataEntity } from "./wikidata.js"

export const Provider = Schema.Literals([
  ...ExternalDataProvider.literals,
  /**
   * The gazetteer's places, read from its own database rather than fetched (`whos-on-first.ts`).
   */
  "WHOS_ON_FIRST",
  /**
   * Forests4Farming's catalogue of plants for syntropic agroforestry: a source we'd trust more than
   * ourselves on strata and succession. Read from a dump until it has an API (`syntropedia.ts`).
   */
  "SYNTROPEDIA",
  /** The Movie Database: films and series, fetched by `tmdbId` (`tmdb.ts`). */
  "TMDB",
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
export type GbifResultWithImportedPhotos = typeof GbifResultWithImportedPhotos.Type

/**
 * Results today's fetchers don't return yet: Google Books' authors per edition. Typed here so
 * extractors can be.
 */
export const GoogleBooksResultWithAuthors = Schema.Struct({
  ...BookResult.fields,
  editions: Schema.Array(
    Schema.Struct({ ...BookEdition.fields, authors: Schema.Array(NonEmptyTrimmedString) }),
  ),
})

export type GoogleBooksResultWithAuthors = typeof GoogleBooksResultWithAuthors.Type

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
  readonly GOOGLE_BOOKS: GoogleBooksResultWithAuthors
  readonly WIKIDATA: WikidataEntity
  readonly GBIF: GbifResultWithImportedPhotos
  readonly CONTENT_CHANNELS: ContentChannelItem
  readonly SYNTROPEDIA: SyntropediaPlant
  readonly TMDB: TmdbWork
  readonly WHOS_ON_FIRST: WhosOnFirstPlace
}

export type FetchedProvider = keyof ProviderResults

/** A provider's result, tagged by the provider: what extraction reads. */
export type ProviderInput = {
  readonly [Provider in FetchedProvider]: {
    readonly provider: Provider
    readonly result: ProviderResults[Provider]
  }
}[FetchedProvider]
