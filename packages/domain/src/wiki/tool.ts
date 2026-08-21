import { Schema } from "effect"

import { ToolUsage } from "../common/enums.js"
import { OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const ToolAttributes = Schema.Struct({
  usage: OptionalColumn(Schema.Array(ToolUsage)),
})
export type ToolAttributes = typeof ToolAttributes.Type

export const ToolWikiArticleKind = Schema.Literal("TOOL")
export type ToolWikiArticleKind = typeof ToolWikiArticleKind.Type

export const ToolContributorEditableData = Schema.TaggedStruct(ToolWikiArticleKind.literal, {
  attributes: ToolAttributes,
  translations: WikiArticleTranslations,
})
export type ToolContributorEditableData = typeof ToolContributorEditableData.Type
