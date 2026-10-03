import { Option, Schema } from "effect"

import { GoogleBooksVolumeId } from "../../common/external-identifiers.js"
import { TagId } from "../../common/ids.js"
import {
  IntNonNegative,
  NameInCrdtList,
  OptionalColumn,
  ValidName,
  CrdtBrandedStringSet,
} from "../../common/primitives.js"
import { PartialDate } from "../../common/utils/dates.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  googleBooksVolumeId: OptionalColumn(GoogleBooksVolumeId),
  authors: OptionalColumn(Schema.Array(ValidName)),
  tags: OptionalColumn(Schema.Array(TagId)),
  publisher: OptionalColumn(Schema.String),
  url: OptionalColumn(Schema.URLFromString),
  publicationDate: OptionalColumn(PartialDate),
  isbn10: OptionalColumn(Schema.String),
  isbn13: OptionalColumn(Schema.String),
  edition: OptionalColumn(Schema.String),
  language: OptionalColumn(Schema.String),
  pageCount: OptionalColumn(IntNonNegative),
})

export const WikiBookArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("BOOK"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    authors: OptionalColumn(Schema.Array(NameInCrdtList)),
    tags: OptionalColumn(CrdtBrandedStringSet(TagId)),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      authors: Option.map(editableAttributes.authors, (authors) =>
        authors.map((author) => author.value),
      ),
      tags: Option.map(editableAttributes.tags, (tags) => Array.from(tags)),
    }),
})

export type BookArticleKind = typeof WikiBookArticle.Kind.Type
export type BookEditableAttributes = typeof WikiBookArticle.EditableAttributes.Type
export type BookMaterializedAttributes = typeof WikiBookArticle.MaterializedAttributes.Type
export type BookEditableArticle = typeof WikiBookArticle.EditableArticle.Type
export type BookMaterializedRow = typeof WikiBookArticle.MaterializedRow.Type
