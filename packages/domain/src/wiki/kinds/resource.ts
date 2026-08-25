import { Schema } from "effect"

import { ResourceFormat } from "../../common/enums.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  format: ResourceFormat,
  url: Schema.URLFromString,
})

export const WikiResourceArticle = defineKind({
  Kind: Schema.Literal("RESOURCE"),
  EditableAttributes: MaterializedAttributes,
  MaterializedAttributes: MaterializedAttributes,
  materializeAttributes: (editableAttributes) => MaterializedAttributes.make(editableAttributes),
})

export type ResourceArticleKind = typeof WikiResourceArticle.Kind.Type
export type ResourceEditableAttributes = typeof WikiResourceArticle.EditableAttributes.Type
export type ResourceMaterializedAttributes = typeof WikiResourceArticle.MaterializedAttributes.Type
export type ResourceEditableArticle = typeof WikiResourceArticle.EditableArticle.Type
export type ResourceMaterializedRow = typeof WikiResourceArticle.MaterializedRow.Type
