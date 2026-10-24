import { Schema } from "effect"

import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({})

export const WikiConceptArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("CONCEPT"),
  EditableAttributes: ProjectedAttributes,
  ProjectedAttributes,
  projectAttributes: (editableAttributes) => editableAttributes,
})

export type ConceptArticleKind = typeof WikiConceptArticle.Kind.Type
export type ConceptEditableAttributes = typeof WikiConceptArticle.EditableAttributes.Type
export type ConceptProjectedAttributes = typeof WikiConceptArticle.ProjectedAttributes.Type
export type ConceptEditableArticle = typeof WikiConceptArticle.EditableArticle.Type
export type ConceptProjectionRow = typeof WikiConceptArticle.ProjectionRow.Type
