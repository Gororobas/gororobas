import { Option, Schema } from "effect"

import {
  IntNonNegative,
  NameInCrdtList,
  OptionalColumn,
  ValidName,
} from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  authors: OptionalColumn(Schema.Array(ValidName)),
  publisher: OptionalColumn(Schema.String),
  publicationDate: OptionalColumn(Schema.String),
  isbn10: OptionalColumn(Schema.String),
  isbn13: OptionalColumn(Schema.String),
  edition: OptionalColumn(Schema.String),
  language: OptionalColumn(Schema.String),
  pageCount: OptionalColumn(IntNonNegative),
})

export const WikiBookArticle = defineKind({
  Kind: Schema.Literal("BOOK"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    authors: OptionalColumn(Schema.Array(NameInCrdtList)),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      authors: Option.map(editableAttributes.authors, (authors) =>
        authors.map((author) => author.value),
      ),
    }),
})

export type BookArticleKind = typeof WikiBookArticle.Kind.Type
export type BookEditableAttributes = typeof WikiBookArticle.EditableAttributes.Type
export type BookMaterializedAttributes = typeof WikiBookArticle.MaterializedAttributes.Type
export type BookEditableArticle = typeof WikiBookArticle.EditableArticle.Type
export type BookMaterializedRow = typeof WikiBookArticle.MaterializedRow.Type
