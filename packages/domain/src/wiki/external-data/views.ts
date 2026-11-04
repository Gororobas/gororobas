import { Schema } from "effect"

import { ExternalDataObservationId, WikiArticleId } from "../../common/ids.js"
import { Handle, PaginationOptions, UrlAsString } from "../../common/primitives.js"
import { WikiArticleKind } from "../wiki-article.js"
import { ExternalDataProvider, ExternalLink, ExternalMedia } from "./common.js"
import { BookEdition } from "./kinds/book-external-data.js"
import { GbifClassification } from "./kinds/plant-external-data.js"

// ARTICLE PAGE

/** Credits a provider on an article's page, linking to where readers can check its data. */
export const ExternalDataAttribution = Schema.Struct({
  provider: ExternalDataProvider,
  /** The provider's identifier for what the article is about, such as a Wikidata item. */
  externalId: Schema.String,
  url: UrlAsString,
  observedAt: Schema.DateTimeUtcFromString,
})

export type ExternalDataAttribution = typeof ExternalDataAttribution.Type

export const ExternalTaxonomy = Schema.Struct({
  taxonomyGroup: Schema.NullOr(Schema.String),
  classification: Schema.Array(GbifClassification),
})

/**
 * What providers' latest successful fetches stored for an article. Every list is empty, and
 * taxonomy null, for what a kind doesn't fetch.
 */
export const WikiArticleExternalData = Schema.Struct({
  attributions: Schema.Array(ExternalDataAttribution),
  wikipediaLinks: Schema.Array(ExternalLink),
  taxonomy: Schema.NullOr(ExternalTaxonomy),
  media: Schema.Array(ExternalMedia),
  bookEditions: Schema.Array(BookEdition),
})

export type WikiArticleExternalData = typeof WikiArticleExternalData.Type

// OBSERVATION LOG

export const ExternalDataOutcomeTag = Schema.Literals(["Success", "Failure"])
export type ExternalDataOutcomeTag = typeof ExternalDataOutcomeTag.Type

export const ExternalDataObservationLogQuery = Schema.Struct({
  provider: Schema.optional(ExternalDataProvider),
  outcome: Schema.optional(ExternalDataOutcomeTag),
  wikiArticleId: Schema.optional(WikiArticleId),
  /** Newest first, a page at a time. */
  currentPage: Schema.optional(PaginationOptions.fields.currentPage),
})

export type ExternalDataObservationLogQuery = typeof ExternalDataObservationLogQuery.Type

/** One request an observation made, without the response it kept. */
export const ExternalDataObservationSource = Schema.Struct({
  externalId: Schema.String,
  sourceUrl: Schema.String,
  fetchedAt: Schema.String,
  /** The size of the stored response, in characters of JSON. */
  payloadLength: Schema.Int,
})

export const ExternalDataObservationLogEntry = Schema.Struct({
  id: ExternalDataObservationId,
  provider: ExternalDataProvider,
  observedAt: Schema.DateTimeUtcFromString,
  article: Schema.Struct({
    id: WikiArticleId,
    kind: WikiArticleKind,
    handle: Handle,
    title: Schema.NullOr(Schema.String),
  }),
  /** What the article supplied: its identifiers at the time, such as a Wikidata ID or ISBNs. */
  inputs: Schema.Json,
  outcome: ExternalDataOutcomeTag,
  sources: Schema.Array(ExternalDataObservationSource),
  error: Schema.NullOr(Schema.Struct({ message: Schema.String, isRetryable: Schema.Boolean })),
})

export type ExternalDataObservationLogEntry = typeof ExternalDataObservationLogEntry.Type

export const ExternalDataProviderTally = Schema.Struct({
  provider: ExternalDataProvider,
  successes: Schema.Int,
  failures: Schema.Int,
  /** Articles whose latest observation from this provider failed. */
  articlesFailing: Schema.Int,
  lastObservedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
})

export const ExternalDataObservationLogPage = Schema.Struct({
  entries: Schema.Array(ExternalDataObservationLogEntry),
  /** Observations matching the query, across every page. */
  totalCount: Schema.Int,
  pageSize: Schema.Int,
  /** Every provider's totals, regardless of the query's filters. */
  tallies: Schema.Array(ExternalDataProviderTally),
})

export type ExternalDataObservationLogPage = typeof ExternalDataObservationLogPage.Type

/** An observation with the responses it kept, for reading what a provider actually returned. */
export const ExternalDataObservationDetail = Schema.Struct({
  entry: ExternalDataObservationLogEntry,
  outcome: Schema.Json,
})

export type ExternalDataObservationDetail = typeof ExternalDataObservationDetail.Type
