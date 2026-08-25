import { Schema } from "effect"

import { OptionalColumn, ValidName } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  suggestedKind: OptionalColumn(ValidName),
})

export const WikiUncategorizedArticle = defineKind({
  Kind: Schema.Literal("UNCATEGORIZED"),
  EditableAttributes: Schema.Struct({
    suggestedKind: OptionalColumn(ValidName),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      suggestedKind: editableAttributes.suggestedKind,
    }),
})

export type UncategorizedArticleKind = typeof WikiUncategorizedArticle.Kind.Type
export type UncategorizedEditableAttributes =
  typeof WikiUncategorizedArticle.EditableAttributes.Type
export type UncategorizedMaterializedAttributes =
  typeof WikiUncategorizedArticle.MaterializedAttributes.Type
export type UncategorizedEditableArticle = typeof WikiUncategorizedArticle.EditableArticle.Type
export type UncategorizedMaterializedRow = typeof WikiUncategorizedArticle.MaterializedRow.Type
