import { Schema } from "effect"
import * as Length from "effect-units/Length"
import * as Temperature from "effect-units/Temperature"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../common/enums.js"
import { IntNonNegative, NameInCrdtList, OptionalColumn } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const PlantAttributes = Schema.Struct({
  developmentCycleMax: OptionalColumn(IntNonNegative),
  developmentCycleMin: OptionalColumn(IntNonNegative),
  edibleParts: OptionalColumn(Schema.Array(EdiblePlantPart)),
  heightMax: OptionalColumn(Length.Length),
  heightMin: OptionalColumn(Length.Length),
  lifecycles: OptionalColumn(Schema.Array(PlantLifecycle)),
  plantingMethods: OptionalColumn(Schema.Array(PlantingMethod)),
  scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
  strata: OptionalColumn(Schema.Array(AgroforestryStratum)),
  temperatureMax: OptionalColumn(Temperature.Temperature),
  temperatureMin: OptionalColumn(Temperature.Temperature),
  usage: OptionalColumn(Schema.Array(PlantUsage)),
})
export type PlantAttributes = typeof PlantAttributes.Type

export const PlantWikiArticleKind = Schema.Literal("PLANT")
export type PlantWikiArticleKind = typeof PlantWikiArticleKind.Type

export const PlantContributorEditableData = Schema.TaggedStruct(PlantWikiArticleKind.literal, {
  attributes: PlantAttributes,
  translations: WikiArticleTranslations,
})
export type PlantContributorEditableData = typeof PlantContributorEditableData.Type
