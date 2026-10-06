import { Option, Schema } from "effect"

import { ToolUsage } from "../../common/enums.js"
import { CrdtLiteralSet, OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  usage: OptionalColumn(Schema.Array(ToolUsage)),
})

export const WikiToolArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("TOOL"),
  EditableAttributes: Schema.Struct({
    usage: OptionalColumn(CrdtLiteralSet(ToolUsage)),
  }),
  ProjectedAttributes,
  projectAttributes: (editableAttributes) =>
    ProjectedAttributes.make({
      usage: Option.map(editableAttributes.usage, (usage) => Array.from(usage)),
    }),
})

export type ToolArticleKind = typeof WikiToolArticle.Kind.Type
export type ToolEditableAttributes = typeof WikiToolArticle.EditableAttributes.Type
export type ToolProjectedAttributes = typeof WikiToolArticle.ProjectedAttributes.Type
export type ToolEditableArticle = typeof WikiToolArticle.EditableArticle.Type
export type ToolProjectionRow = typeof WikiToolArticle.ProjectionRow.Type
