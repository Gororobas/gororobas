import { Schema } from "effect"

import { ToolUsage } from "../common/enums.js"
import { NameInCrdtList, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const AnimalAttributes = Schema.Struct({
  scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
  roles: OptionalColumn(Schema.Array(ToolUsage)),
})
export type AnimalAttributes = typeof AnimalAttributes.Type

export const AnimalWikiArticleKind = Schema.Literal("ANIMAL")
export type AnimalWikiArticleKind = typeof AnimalWikiArticleKind.Type

export const AnimalArticleData = Schema.TaggedStruct(AnimalWikiArticleKind.literal, {
  attributes: AnimalAttributes,
  translations: WikiArticleTranslations,
})
export type AnimalArticleData = typeof AnimalArticleData.Type
