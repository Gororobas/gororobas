import { Option, Schema } from "effect"

import { ToolUsage } from "../../common/enums.js"
import { CrdtLiteralSet, OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const materializedAttributes = Schema.Struct({
  usage: OptionalColumn(Schema.Array(ToolUsage)),
})

export const WikiToolArticle = defineKind({
  Kind: Schema.Literal("TOOL"),
  EditableAttributes: Schema.Struct({
    usage: OptionalColumn(CrdtLiteralSet(ToolUsage)),
  }),
  MaterializedAttributes: materializedAttributes,
  materializeAttributes: (editableAttributes) =>
    materializedAttributes.make({
      usage: Option.map(editableAttributes.usage, (usage) => Array.from(usage)),
    }),
})

export type ToolArticleKind = typeof WikiToolArticle.Kind.Type
export type ToolEditableAttributes = typeof WikiToolArticle.EditableAttributes.Type
export type ToolMaterializedAttributes = typeof WikiToolArticle.MaterializedAttributes.Type
export type ToolEditableArticle = typeof WikiToolArticle.EditableArticle.Type
export type ToolMaterializedRow = typeof WikiToolArticle.MaterializedRow.Type
