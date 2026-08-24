import { Option, Schema } from "effect"

import { TagId } from "../../common/ids.js"
import { CrdtBrandedStringSet, OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const materializedAttributes = Schema.Struct({
  tags: OptionalColumn(Schema.Array(TagId)),
})

export const WikiConceptArticle = defineKind({
  Kind: Schema.Literal("CONCEPT"),
  EditableAttributes: Schema.Struct({
    tags: OptionalColumn(CrdtBrandedStringSet(TagId)),
  }),
  MaterializedAttributes: materializedAttributes,
  materializeAttributes: (editableAttributes) =>
    materializedAttributes.make({
      tags: Option.map(editableAttributes.tags, (tags) => Array.from(tags)),
    }),
})

export type ConceptArticleKind = typeof WikiConceptArticle.Kind.Type
export type ConceptEditableAttributes = typeof WikiConceptArticle.EditableAttributes.Type
export type ConceptMaterializedAttributes = typeof WikiConceptArticle.MaterializedAttributes.Type
export type ConceptEditableArticle = typeof WikiConceptArticle.EditableArticle.Type
export type ConceptMaterializedRow = typeof WikiConceptArticle.MaterializedRow.Type
