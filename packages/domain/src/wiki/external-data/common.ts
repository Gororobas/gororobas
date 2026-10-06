import { Schema } from "effect"

import { UrlAsString } from "../../common/primitives.js"

export const ExternalDataProvider = Schema.Literals(["WIKIDATA", "GBIF", "GOOGLE_BOOKS"])

export const ExternalMedia = Schema.Struct({
  creditLine: Schema.String,
  licenseUrl: Schema.NullOr(UrlAsString),
  mediaUrl: UrlAsString,
  sourceUrl: UrlAsString,
})

export const Observation = Schema.Struct({
  provider: ExternalDataProvider,
  externalId: Schema.String,
  sourceUrl: UrlAsString,
  fetchedAt: Schema.String,
  payload: Schema.Json,
})

export type Observation = typeof Observation.Type

export const ExternalLink = Schema.Struct({ locale: Schema.String, url: UrlAsString })
