import { Option, Schema } from "effect"

import { TagId } from "../../common/ids.js"
import { CrdtBrandedStringSet, OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  tags: OptionalColumn(Schema.Array(TagId)),
})

export const WikiConceptArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("CONCEPT"),
  EditableAttributes: Schema.Struct({
    tags: OptionalColumn(CrdtBrandedStringSet(TagId)),
  }),
  ProjectedAttributes,
  projectAttributes: (editableAttributes) =>
    ProjectedAttributes.make({
      tags: Option.map(editableAttributes.tags, (tags) => Array.from(tags)),
    }),
})

export type ConceptArticleKind = typeof WikiConceptArticle.Kind.Type
export type ConceptEditableAttributes = typeof WikiConceptArticle.EditableAttributes.Type
export type ConceptProjectedAttributes = typeof WikiConceptArticle.ProjectedAttributes.Type
export type ConceptEditableArticle = typeof WikiConceptArticle.EditableArticle.Type
export type ConceptProjectionRow = typeof WikiConceptArticle.ProjectionRow.Type
