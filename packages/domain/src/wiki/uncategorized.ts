import { Schema } from "effect"

import { NonEmptyTrimmedString, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const UncategorizedWikiArticleKind = Schema.Literal("Uncategorized")
export type UncategorizedWikiArticleKind = typeof UncategorizedWikiArticleKind.Type

export const UncategorizedEditableAttributes = Schema.Struct({
  suggestedKind: OptionalColumn(NonEmptyTrimmedString),
})
export type UncategorizedEditableAttributes = typeof UncategorizedEditableAttributes.Type

export const UncategorizedMaterializedAttributes = UncategorizedEditableAttributes
export type UncategorizedMaterializedAttributes = typeof UncategorizedMaterializedAttributes.Type

export const UncategorizedEditableArticle = Schema.Struct({
  kind: UncategorizedWikiArticleKind,
  attributes: UncategorizedEditableAttributes,
  translations: WikiArticleTranslations,
})
export type UncategorizedEditableArticle = typeof UncategorizedEditableArticle.Type
