import { Schema } from "effect"

import { ToolUsage } from "../common/enums.js"
import { CrdtLiteralSet, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const ToolWikiArticleKind = Schema.Literal("TOOL")
export type ToolWikiArticleKind = typeof ToolWikiArticleKind.Type

export const ToolEditableAttributes = Schema.Struct({
  usage: OptionalColumn(CrdtLiteralSet(ToolUsage)),
})
export type ToolEditableAttributes = typeof ToolEditableAttributes.Type

export const ToolMaterializedAttributes = Schema.Struct({
  usage: OptionalColumn(Schema.Array(ToolUsage)),
})
export type ToolMaterializedAttributes = typeof ToolMaterializedAttributes.Type

export const ToolEditableArticle = Schema.Struct({
  kind: ToolWikiArticleKind,
  attributes: ToolEditableAttributes,
  translations: WikiArticleTranslations,
})
export type ToolEditableArticle = typeof ToolEditableArticle.Type
