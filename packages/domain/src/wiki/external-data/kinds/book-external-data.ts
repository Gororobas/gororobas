import { Schema, Struct } from "effect"

import { GoogleBooksVolumeId } from "../../../common/external-identifiers.js"
import { UrlAsString } from "../../../common/primitives.js"
import { WikiBookArticle } from "../../kinds/book.js"
import { BookEdition, Observation } from "../common.js"
import { ExternalDataFetchError } from "../error.js"

export const BookResult = Schema.Struct({
  observations: Schema.Array(Observation),
  editions: Schema.Array(BookEdition),
  coverage: Schema.Literals(["COMPLETE", "PARTIAL"]),
})

/** Without a volume ID, the fetcher looks for a volume listing one of the ISBNs. */
export const BookExternalDataInputs = Schema.Struct({
  kind: Schema.Literal("BOOK"),
  ...WikiBookArticle.EditableAttributes.mapFields(
    Struct.pick(["googleBooksVolumeId", "isbn13", "isbn10"]),
  ).fields,
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
