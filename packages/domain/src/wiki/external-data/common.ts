import { Schema } from "effect"

import { PositiveInteger, UrlAsString } from "../../common/primitives.js"

export const ExternalDataProvider = Schema.Literals(["WIKIDATA", "GBIF", "GOOGLE_BOOKS"])

export const ExternalMedia = Schema.Struct({
  creditLine: Schema.String,
  licenseUrl: Schema.NullOr(UrlAsString),
  mediaUrl: UrlAsString,
  sourceUrl: UrlAsString,
  /** As displayed, read from the image itself: providers don't list them. Null when unreadable. */
  width: Schema.NullOr(PositiveInteger),
  height: Schema.NullOr(PositiveInteger),
})

export type ExternalMedia = typeof ExternalMedia.Type

export const Observation = Schema.Struct({
  provider: ExternalDataProvider,
  externalId: Schema.String,
  sourceUrl: UrlAsString,
  fetchedAt: Schema.String,
  payload: Schema.Json,
})

export type Observation = typeof Observation.Type

export const ExternalLink = Schema.Struct({ language: Schema.String, url: UrlAsString })
export type ExternalLink = typeof ExternalLink.Type
