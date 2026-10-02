import { UrlAsString } from "@gororobas/domain"
import { Schema, Struct } from "effect"

import { WikiBookArticle } from "../../kinds/book.js"
import { Observation } from "../common.js"
import { ExternalDataFetchError } from "../error.js"

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

export const BookExternalDataInputs = Schema.Struct({
  kind: Schema.Literal("BOOK"),
  ...WikiBookArticle.EditableAttributes.mapFields(
    Struct.pick(["googleBooksVolumeId", "openLibraryWorkId"]),
  ).fields,
})

export const BookExternalDataResult = Schema.Struct({
  kind: Schema.Literal("BOOK"),
  attributes: Schema.Struct({
    openLibrary: Schema.NullOr(Schema.Result(BookResult, ExternalDataFetchError)),
    googleBooks: Schema.NullOr(Schema.Result(BookResult, ExternalDataFetchError)),
  }),
})
export type BookExternalDataResult = typeof BookExternalDataResult.Type
