import { Option, Schema } from "effect"

import { ResourceFormat } from "../../common/enums.js"
import { TagId } from "../../common/ids.js"
import { CrdtBrandedStringSet, OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  format: ResourceFormat,
  url: Schema.URLFromString,
  creditLine: OptionalColumn(Schema.String),
  tags: OptionalColumn(Schema.Array(TagId)),
})

export const WikiResourceArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("RESOURCE"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    tags: OptionalColumn(CrdtBrandedStringSet(TagId)),
  }),
  MaterializedAttributes: MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      tags: Option.map(editableAttributes.tags, (tags) => Array.from(tags)),
    }),
})

export type ResourceArticleKind = typeof WikiResourceArticle.Kind.Type
export type ResourceEditableAttributes = typeof WikiResourceArticle.EditableAttributes.Type
export type ResourceMaterializedAttributes = typeof WikiResourceArticle.MaterializedAttributes.Type
export type ResourceEditableArticle = typeof WikiResourceArticle.EditableArticle.Type
export type ResourceMaterializedRow = typeof WikiResourceArticle.MaterializedRow.Type
