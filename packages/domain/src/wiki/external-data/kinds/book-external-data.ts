import { Schema } from "effect"

import { GoogleBooksVolumeId } from "../../../common/external-identifiers.js"
import { OptionalColumn, UrlAsString } from "../../../common/primitives.js"
import { Observation } from "../common.js"
import { ExternalDataFetchError } from "../error.js"

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

export const BookResult = Schema.Struct({
  observations: Schema.Array(Observation),
  editions: Schema.Array(BookEdition),
  coverage: Schema.Literals(["COMPLETE", "PARTIAL"]),
})

/**
 * The article's identifiers, typed as `WikiBookArticle`'s editable attributes. They're not picked
 * from it because the kind's definition depends on this module, through the page data. Without a
 * volume ID, the fetcher looks for a volume listing one of the ISBNs.
 */
export const BookExternalDataInputs = Schema.Struct({
  kind: Schema.Literal("BOOK"),
  googleBooksVolumeId: OptionalColumn(GoogleBooksVolumeId),
  isbn13: OptionalColumn(Schema.String),
  isbn10: OptionalColumn(Schema.String),
})

export const BookExternalDataResult = Schema.Struct({
  kind: Schema.Literal("BOOK"),
  attributes: Schema.Struct({
    googleBooks: Schema.NullOr(Schema.Result(BookResult, ExternalDataFetchError)),
  }),
})

export type BookExternalDataResult = typeof BookExternalDataResult.Type

export const BookIdSuggestion = Schema.Struct({
  googleBooksVolumeId: GoogleBooksVolumeId,
  title: Schema.String,
  authors: Schema.Array(Schema.String),
  publisher: Schema.NullOr(Schema.String),
  publicationDate: Schema.NullOr(Schema.String),
  language: Schema.NullOr(Schema.String),
  isbn: Schema.Array(Schema.String),
  sourceUrl: UrlAsString,
})

export type BookIdSuggestion = typeof BookIdSuggestion.Type

export const BookIdSuggestionsQuery = Schema.Struct({
  title: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isMaxLength(200)),
})
