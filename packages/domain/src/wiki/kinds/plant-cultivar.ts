import { Effect, Schema } from "effect"
import * as Quantity from "effect-units/Quantity"
import * as Temperature from "effect-units/Temperature"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../../common/enums.js"
import { WikiArticleId } from "../../common/ids.js"
import {
  Centimeters,
  IntNonNegative,
  TemperatureInCelsius,
  ValidName,
} from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const UnknownCultivarProperty = Schema.TaggedStruct("Unknown", {})

/** Unknown may be displayed alongside parent information, but never becomes inherited data. */
export const CultivarProperty = <S extends Schema.Schema<unknown>>(ValueSchema: S) =>
  Schema.Union([
    UnknownCultivarProperty,
    Schema.TaggedStruct("Inherit", {}),
    Schema.TaggedStruct("Value", { value: ValueSchema }),
  ] as const).pipe(Schema.withConstructorDefault(Effect.succeed(UnknownCultivarProperty.make({}))))

const HeightRange = Schema.Struct({ min: Centimeters, max: Centimeters }).check(
  Schema.makeFilter(
    (range) =>
      Quantity.isLessThanOrEqualTo(range.min, range.max) ||
      "Height minimum must not exceed maximum",
    {
      identifier: "CultivarHeightRange",
      title: "Cultivar height range",
      description: "The minimum height in centimeters must not exceed the maximum.",
    },
  ),
)

const DevelopmentCycleRange = Schema.Struct({ min: IntNonNegative, max: IntNonNegative }).check(
  Schema.makeFilter(
    (range) => range.min <= range.max || "Development cycle minimum must not exceed maximum",
    {
      identifier: "CultivarDevelopmentCycleRange",
      title: "Cultivar development cycle range",
      description: "The minimum development cycle in days must not exceed the maximum.",
    },
  ),
)

const TemperatureRange = Schema.Struct({
  min: TemperatureInCelsius,
  max: TemperatureInCelsius,
}).check(
  Schema.makeFilter(
    (range) =>
      Temperature.isLessThanOrEqualTo(range.min, range.max) ||
      "Temperature minimum must not exceed maximum",
    {
      identifier: "CultivarTemperatureRange",
      title: "Cultivar temperature range",
      description: "The minimum temperature in Celsius must not exceed the maximum.",
    },
  ),
)

const Attributes = Schema.Struct({
  parentPlantId: WikiArticleId,
  scientificNames: CultivarProperty(Schema.Array(ValidName)),
  developmentCycle: CultivarProperty(DevelopmentCycleRange),
  height: CultivarProperty(HeightRange),
  temperature: CultivarProperty(TemperatureRange),
  edibleParts: CultivarProperty(Schema.Array(EdiblePlantPart)),
  lifecycles: CultivarProperty(Schema.Array(PlantLifecycle)),
  plantingMethods: CultivarProperty(Schema.Array(PlantingMethod)),
  strata: CultivarProperty(Schema.Array(AgroforestryStratum)),
  usage: CultivarProperty(Schema.Array(PlantUsage)),
})

export const WikiPlantCultivarArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("PLANT_CULTIVAR"),
  EditableAttributes: Attributes,
  ProjectedAttributes: Attributes,
  // Preserve authored states; parent traits belong to a separate read-time presentation.
  projectAttributes: (editableAttributes) => Attributes.make(editableAttributes),
})

export type PlantCultivarArticleKind = typeof WikiPlantCultivarArticle.Kind.Type
export type PlantCultivarEditableAttributes =
  typeof WikiPlantCultivarArticle.EditableAttributes.Type
export type PlantCultivarProjectedAttributes =
  typeof WikiPlantCultivarArticle.ProjectedAttributes.Type
export type PlantCultivarEditableArticle = typeof WikiPlantCultivarArticle.EditableArticle.Type
export type PlantCultivarProjectionRow = typeof WikiPlantCultivarArticle.ProjectionRow.Type
