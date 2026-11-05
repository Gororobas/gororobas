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

export const ExternalLink = Schema.Struct({ language: Schema.String, url: UrlAsString })
export type ExternalLink = typeof ExternalLink.Type

/** One rank of a taxon's classification, such as its family. */
export const GbifClassification = Schema.Struct({
  taxonId: Schema.String,
  scientificName: Schema.String,
  taxonRank: Schema.String,
})

export type GbifClassification = typeof GbifClassification.Type

/** A published edition of a book, as a catalogue lists it. */
export const BookEdition = Schema.Struct({
  externalId: Schema.String,
  title: Schema.String,
  publisher: Schema.NullOr(Schema.String),
  publicationDate: Schema.NullOr(Schema.String),
  pageCount: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  languages: Schema.Array(Schema.String),
  isbn: Schema.Array(Schema.String),
  sourceUrl: UrlAsString,
})

export type BookEdition = typeof BookEdition.Type
