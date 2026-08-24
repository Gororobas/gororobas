import { Schema } from "effect"

import { NameInCrdtList, OptionalColumn } from "../common/primitives.js"
import { WikiArticleEditableTranslations } from "../wiki/wiki-article-translation.js"

export const PlantVarietyAttributes = Schema.Struct({
  scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
})
export type PlantVarietyAttributes = typeof PlantVarietyAttributes.Type

export const PlantVarietyArticleData = Schema.Struct({
  attributes: PlantVarietyAttributes,
  translations: WikiArticleEditableTranslations,
})
export type PlantVarietyArticleData = typeof PlantVarietyArticleData.Type
