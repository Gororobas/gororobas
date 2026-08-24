import { Schema } from "effect"

import { NonEmptyTrimmedString, OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const materializedAttributes = Schema.Struct({
  suggestedKind: OptionalColumn(NonEmptyTrimmedString),
})

export const WikiUncategorizedArticle = defineKind({
  Kind: Schema.Literal("UNCATEGORIZED"),
  EditableAttributes: Schema.Struct({
    suggestedKind: OptionalColumn(NonEmptyTrimmedString),
  }),
  MaterializedAttributes: materializedAttributes,
  materializeAttributes: (editableAttributes) =>
    materializedAttributes.make({
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
