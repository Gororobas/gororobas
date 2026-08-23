import { Schema } from "effect"

import { TagId } from "../common/ids.js"
import { CrdtBrandedStringSet, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const ConceptWikiArticleKind = Schema.Literal("CONCEPT")
export type ConceptWikiArticleKind = typeof ConceptWikiArticleKind.Type

export const ConceptEditableAttributes = Schema.Struct({
  tags: OptionalColumn(CrdtBrandedStringSet(TagId)),
})
export type ConceptEditableAttributes = typeof ConceptEditableAttributes.Type

export const ConceptMaterializedAttributes = Schema.Struct({
  tags: OptionalColumn(Schema.Array(TagId)),
})
export type ConceptMaterializedAttributes = typeof ConceptMaterializedAttributes.Type

export const ConceptEditableArticle = Schema.Struct({
  kind: ConceptWikiArticleKind,
  attributes: ConceptEditableAttributes,
  translations: WikiArticleTranslations,
})
export type ConceptEditableArticle = typeof ConceptEditableArticle.Type
