import { Schema } from "effect"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../common/enums.js"
import { IntNonNegative, NameInCrdtList, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

const Centimeters = IntNonNegative.pipe(Schema.brand("Centimeters"))
const TemperatureInCelsius = Schema.Number.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("TemperatureInCelsius"),
)

export const PlantAttributes = Schema.Struct({
  developmentCycleMax: OptionalColumn(IntNonNegative),
  developmentCycleMin: OptionalColumn(IntNonNegative),
  edibleParts: OptionalColumn(Schema.Array(EdiblePlantPart)),
  heightMax: OptionalColumn(Centimeters),
  heightMin: OptionalColumn(Centimeters),
  lifecycles: OptionalColumn(Schema.Array(PlantLifecycle)),
  plantingMethods: OptionalColumn(Schema.Array(PlantingMethod)),
  scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
  strata: OptionalColumn(Schema.Array(AgroforestryStratum)),
  temperatureMax: OptionalColumn(TemperatureInCelsius),
  temperatureMin: OptionalColumn(TemperatureInCelsius),
  usage: OptionalColumn(Schema.Array(PlantUsage)),
})
export type PlantAttributes = typeof PlantAttributes.Type

export const PlantWikiArticleKind = Schema.Literal("PLANT")
export type PlantWikiArticleKind = typeof PlantWikiArticleKind.Type

export const PlantArticleData = Schema.TaggedStruct(PlantWikiArticleKind.literal, {
  attributes: PlantAttributes,
  translations: WikiArticleTranslations,
})
export type PlantArticleData = typeof PlantArticleData.Type
