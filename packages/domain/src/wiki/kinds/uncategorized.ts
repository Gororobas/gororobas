import { Schema } from "effect"

import { OptionalColumn, ValidName } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  suggestedKind: OptionalColumn(ValidName),
})

export const WikiUncategorizedArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("UNCATEGORIZED"),
  EditableAttributes: Schema.Struct({
    suggestedKind: OptionalColumn(ValidName),
  }),
  ProjectedAttributes,
  projectAttributes: (editableAttributes) =>
    ProjectedAttributes.make({
      suggestedKind: editableAttributes.suggestedKind,
    }),
})

export type UncategorizedArticleKind = typeof WikiUncategorizedArticle.Kind.Type
export type UncategorizedEditableAttributes =
  typeof WikiUncategorizedArticle.EditableAttributes.Type
export type UncategorizedProjectedAttributes =
  typeof WikiUncategorizedArticle.ProjectedAttributes.Type
export type UncategorizedEditableArticle = typeof WikiUncategorizedArticle.EditableArticle.Type
export type UncategorizedProjectionRow = typeof WikiUncategorizedArticle.ProjectionRow.Type
