import { Schema } from "effect"

import { TagId } from "../common/ids.js"
import { OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const ConceptAttributes = Schema.Struct({
  tags: OptionalColumn(Schema.Array(TagId)),
})
export type ConceptAttributes = typeof ConceptAttributes.Type

export const ConceptWikiArticleKind = Schema.Literal("CONCEPT")
export type ConceptWikiArticleKind = typeof ConceptWikiArticleKind.Type

export const ConceptArticleData = Schema.TaggedStruct(ConceptWikiArticleKind.literal, {
  attributes: ConceptAttributes,
  translations: WikiArticleTranslations,
})
export type ConceptArticleData = typeof ConceptArticleData.Type
