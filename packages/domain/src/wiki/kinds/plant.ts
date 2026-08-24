import { Option, Schema } from "effect"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../../common/enums.js"
import {
  Centimeters,
  CrdtLiteralSet,
  IntNonNegative,
  NameInCrdtList,
  OptionalColumn,
  TemperatureInCelsius,
  ValidName,
} from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const plantUniversalAttributes = {
  developmentCycleMax: OptionalColumn(IntNonNegative),
  developmentCycleMin: OptionalColumn(IntNonNegative),
  heightMax: OptionalColumn(Centimeters),
  heightMin: OptionalColumn(Centimeters),
  temperatureMax: OptionalColumn(TemperatureInCelsius),
  temperatureMin: OptionalColumn(TemperatureInCelsius),
}

const materializedAttributes = Schema.Struct({
  ...plantUniversalAttributes,
  scientificNames: OptionalColumn(Schema.Array(ValidName)),
  edibleParts: OptionalColumn(Schema.Array(EdiblePlantPart)),
  lifecycles: OptionalColumn(Schema.Array(PlantLifecycle)),
  plantingMethods: OptionalColumn(Schema.Array(PlantingMethod)),
  strata: OptionalColumn(Schema.Array(AgroforestryStratum)),
  usage: OptionalColumn(Schema.Array(PlantUsage)),
})

export const WikiPlantArticle = defineKind({
  Kind: Schema.Literal("PLANT"),
  EditableAttributes: Schema.Struct({
    ...plantUniversalAttributes,
    scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
    edibleParts: OptionalColumn(CrdtLiteralSet(EdiblePlantPart)),
    lifecycles: OptionalColumn(CrdtLiteralSet(PlantLifecycle)),
    plantingMethods: OptionalColumn(CrdtLiteralSet(PlantingMethod)),
    strata: OptionalColumn(CrdtLiteralSet(AgroforestryStratum)),
    usage: OptionalColumn(CrdtLiteralSet(PlantUsage)),
  }),
  MaterializedAttributes: materializedAttributes,
  materializeAttributes: (editableAttributes) =>
    materializedAttributes.make({
      developmentCycleMax: editableAttributes.developmentCycleMax,
      developmentCycleMin: editableAttributes.developmentCycleMin,
      heightMax: editableAttributes.heightMax,
      heightMin: editableAttributes.heightMin,
      temperatureMax: editableAttributes.temperatureMax,
      temperatureMin: editableAttributes.temperatureMin,
      scientificNames: Option.map(editableAttributes.scientificNames, (names) =>
        names.map((n) => n.value),
      ),
      edibleParts: Option.map(editableAttributes.edibleParts, (parts) => Array.from(parts)),
      lifecycles: Option.map(editableAttributes.lifecycles, (cycles) => Array.from(cycles)),
      plantingMethods: Option.map(editableAttributes.plantingMethods, (methods) =>
        Array.from(methods),
      ),
      strata: Option.map(editableAttributes.strata, (strata) => Array.from(strata)),
      usage: Option.map(editableAttributes.usage, (usage) => Array.from(usage)),
    }),
})

export type PlantArticleKind = typeof WikiPlantArticle.Kind.Type
export type PlantEditableAttributes = typeof WikiPlantArticle.EditableAttributes.Type
export type PlantMaterializedAttributes = typeof WikiPlantArticle.MaterializedAttributes.Type
export type PlantEditableArticle = typeof WikiPlantArticle.EditableArticle.Type
export type PlantMaterializedRow = typeof WikiPlantArticle.MaterializedRow.Type
