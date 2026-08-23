import { Schema } from "effect"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../common/enums.js"
import {
  Centimeters,
  CrdtLiteralSet,
  IntNonNegative,
  NameInCrdtList,
  OptionalColumn,
  TemperatureInCelsius,
  ValidName,
} from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const PlantWikiArticleKind = Schema.Literal("PLANT")
export type PlantWikiArticleKind = typeof PlantWikiArticleKind.Type

const plantUniversalAttributes = {
  developmentCycleMax: OptionalColumn(IntNonNegative),
  developmentCycleMin: OptionalColumn(IntNonNegative),
  heightMax: OptionalColumn(Centimeters),
  heightMin: OptionalColumn(Centimeters),
  temperatureMax: OptionalColumn(TemperatureInCelsius),
  temperatureMin: OptionalColumn(TemperatureInCelsius),
}

export const PlantEditableAttributes = Schema.Struct({
  ...plantUniversalAttributes,
  scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
  edibleParts: OptionalColumn(CrdtLiteralSet(EdiblePlantPart)),
  lifecycles: OptionalColumn(CrdtLiteralSet(PlantLifecycle)),
  plantingMethods: OptionalColumn(CrdtLiteralSet(PlantingMethod)),
  strata: OptionalColumn(CrdtLiteralSet(AgroforestryStratum)),
  usage: OptionalColumn(CrdtLiteralSet(PlantUsage)),
})
export type PlantEditableAttributes = typeof PlantEditableAttributes.Type

export const PlantMaterializedAttributes = Schema.Struct({
  ...plantUniversalAttributes,
  scientificNames: OptionalColumn(Schema.Array(ValidName)),
  edibleParts: OptionalColumn(Schema.Array(EdiblePlantPart)),
  lifecycles: OptionalColumn(Schema.Array(PlantLifecycle)),
  plantingMethods: OptionalColumn(Schema.Array(PlantingMethod)),
  strata: OptionalColumn(Schema.Array(AgroforestryStratum)),
  usage: OptionalColumn(Schema.Array(PlantUsage)),
})
export type PlantMaterializedAttributes = typeof PlantMaterializedAttributes.Type

export const PlantEditableArticle = Schema.Struct({
  kind: PlantWikiArticleKind,
  attributes: PlantEditableAttributes,
  translations: WikiArticleTranslations,
})
export type PlantEditableArticle = typeof PlantEditableArticle.Type
