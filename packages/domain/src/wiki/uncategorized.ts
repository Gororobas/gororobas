import { Schema } from "effect"

import { NonEmptyTrimmedString, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const UncategorizedAttributes = Schema.Struct({
  suggestedKind: OptionalColumn(NonEmptyTrimmedString),
})
export type UncategorizedAttributes = typeof UncategorizedAttributes.Type

export const UncategorizedWikiArticleKind = Schema.Literal("Uncategorized")
export type UncategorizedWikiArticleKind = typeof UncategorizedWikiArticleKind.Type

export const UncategorizedArticleData = Schema.TaggedStruct(UncategorizedWikiArticleKind.literal, {
  attributes: UncategorizedAttributes,
  translations: WikiArticleTranslations,
})
export type UncategorizedArticleData = typeof UncategorizedArticleData.Type
