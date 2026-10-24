import { Schema } from "effect"

import { ResourceFormat } from "../../common/enums.js"
import { OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  format: ResourceFormat,
  url: Schema.URLFromString,
  creditLine: OptionalColumn(Schema.String),
})

export const WikiResourceArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("RESOURCE"),
  EditableAttributes: ProjectedAttributes,
  ProjectedAttributes,
  projectAttributes: (editableAttributes) => editableAttributes,
})

export type ResourceArticleKind = typeof WikiResourceArticle.Kind.Type
export type ResourceEditableAttributes = typeof WikiResourceArticle.EditableAttributes.Type
export type ResourceProjectedAttributes = typeof WikiResourceArticle.ProjectedAttributes.Type
export type ResourceEditableArticle = typeof WikiResourceArticle.EditableArticle.Type
export type ResourceProjectionRow = typeof WikiResourceArticle.ProjectionRow.Type
