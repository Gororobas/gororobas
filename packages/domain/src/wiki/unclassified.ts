import { Schema } from "effect"

import { NonEmptyTrimmedString, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const UnclassifiedAttributes = Schema.Struct({
  suggestedKind: OptionalColumn(NonEmptyTrimmedString),
})
export type UnclassifiedAttributes = typeof UnclassifiedAttributes.Type

export const UnclassifiedWikiArticleKind = Schema.Literal("UNCLASSIFIED")
export type UnclassifiedWikiArticleKind = typeof UnclassifiedWikiArticleKind.Type

export const UnclassifiedContributorEditableData = Schema.TaggedStruct(
  UnclassifiedWikiArticleKind.literal,
  {
    attributes: UnclassifiedAttributes,
    translations: WikiArticleTranslations,
  },
)
export type UnclassifiedContributorEditableData = typeof UnclassifiedContributorEditableData.Type
