import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../common/enums.js"
import {
  Centimeters,
  IntNonNegative,
  NameInCrdtList,
  TemperatureInCelsius,
} from "../common/primitives.js"
import { generateMovableListOperations } from "../crdts/movable-list.js"
import { generatePlainValueOperations } from "../crdts/plain-value.js"
import { generateStringHashSetOperations } from "../crdts/string-hash-set.js"
import { PlantAttributes } from "./plant.js"

const scientificNameOperations = generateMovableListOperations("ScientificName")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("scientificNames" satisfies keyof PlantAttributes),
    ),
})

const plantLifecycleOperations = generateStringHashSetOperations("PlantLifecycle")({
  ValueSchema: PlantLifecycle,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("lifecycles" satisfies keyof PlantAttributes),
    ),
})

const plantingMethodOperations = generateStringHashSetOperations("PlantingMethod")({
  ValueSchema: PlantingMethod,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("plantingMethods" satisfies keyof PlantAttributes),
    ),
})

const plantUsageOperations = generateStringHashSetOperations("PlantUsage")({
  ValueSchema: PlantUsage,
  getContainer: (document) =>
    Effect.succeed(
      document.getMap("attributes").ensureMergeableMap("usage" satisfies keyof PlantAttributes),
    ),
})

const ediblePartsOperations = generateStringHashSetOperations("EdibleParts")({
  ValueSchema: EdiblePlantPart,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("edibleParts" satisfies keyof PlantAttributes),
    ),
})

const strataOperations = generateStringHashSetOperations("Strata")({
  ValueSchema: AgroforestryStratum,
  getContainer: (document) =>
    Effect.succeed(
      document.getMap("attributes").ensureMergeableMap("strata" satisfies keyof PlantAttributes),
    ),
})

const developmentCycleMaxOperations = generatePlainValueOperations("DevelopmentCycleMax")({
  ValueSchema: IntNonNegative,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "developmentCycleMax" satisfies keyof PlantAttributes,
})

const developmentCycleMinOperations = generatePlainValueOperations("DevelopmentCycleMin")({
  ValueSchema: IntNonNegative,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "developmentCycleMin" satisfies keyof PlantAttributes,
})

const heightMaxOperations = generatePlainValueOperations("HeightMax")({
  ValueSchema: Centimeters,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "heightMax" satisfies keyof PlantAttributes,
})

const heightMinOperations = generatePlainValueOperations("HeightMin")({
  ValueSchema: Centimeters,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "heightMin" satisfies keyof PlantAttributes,
})

const temperatureMaxOperations = generatePlainValueOperations("TemperatureMax")({
  ValueSchema: TemperatureInCelsius,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "temperatureMax" satisfies keyof PlantAttributes,
})

const temperatureMinOperations = generatePlainValueOperations("TemperatureMin")({
  ValueSchema: TemperatureInCelsius,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "temperatureMin" satisfies keyof PlantAttributes,
})

export const PlantAttributeEdit = Schema.Union([
  scientificNameOperations.added.message,
  scientificNameOperations.removed.message,
  scientificNameOperations.updated.message,
  scientificNameOperations.moved.message,
  plantLifecycleOperations.added.message,
  plantLifecycleOperations.removed.message,
  plantingMethodOperations.added.message,
  plantingMethodOperations.removed.message,
  plantUsageOperations.added.message,
  plantUsageOperations.removed.message,
  strataOperations.added.message,
  strataOperations.removed.message,
  ediblePartsOperations.added.message,
  ediblePartsOperations.removed.message,
  developmentCycleMaxOperations.set.message,
  developmentCycleMaxOperations.unset.message,
  developmentCycleMinOperations.set.message,
  developmentCycleMinOperations.unset.message,
  heightMinOperations.set.message,
  heightMinOperations.unset.message,
  heightMaxOperations.set.message,
  heightMaxOperations.unset.message,
  temperatureMinOperations.set.message,
  temperatureMinOperations.unset.message,
  temperatureMaxOperations.set.message,
  temperatureMaxOperations.unset.message,
]).pipe(Schema.toTaggedUnion("_tag"))
export type PlantAttributeEdit = typeof PlantAttributeEdit.Type

export const applyPlantAttributeEdit = (document: LoroDoc, change: PlantAttributeEdit) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      AddedScientificName: (message) => scientificNameOperations.added.handler(document, message),
      MovedScientificName: (message) => scientificNameOperations.moved.handler(document, message),
      RemovedScientificName: (message) =>
        scientificNameOperations.removed.handler(document, message),
      UpdatedScientificName: (message) =>
        scientificNameOperations.updated.handler(document, message),
      AddedEdibleParts: (message) => ediblePartsOperations.added.handler(document, message),
      RemovedEdibleParts: (message) => ediblePartsOperations.removed.handler(document, message),
      AddedPlantLifecycle: (message) => plantLifecycleOperations.added.handler(document, message),
      RemovedPlantLifecycle: (message) =>
        plantLifecycleOperations.removed.handler(document, message),
      AddedPlantUsage: (message) => plantUsageOperations.added.handler(document, message),
      RemovedPlantUsage: (message) => plantUsageOperations.removed.handler(document, message),
      AddedPlantingMethod: (message) => plantingMethodOperations.added.handler(document, message),
      RemovedPlantingMethod: (message) =>
        plantingMethodOperations.removed.handler(document, message),
      AddedStrata: (message) => strataOperations.added.handler(document, message),
      RemovedStrata: (message) => strataOperations.removed.handler(document, message),
      SetDevelopmentCycleMax: (message) =>
        developmentCycleMaxOperations.set.handler(document, message),
      UnsetDevelopmentCycleMax: (message) =>
        developmentCycleMaxOperations.unset.handler(document, message),
      SetDevelopmentCycleMin: (message) =>
        developmentCycleMinOperations.set.handler(document, message),
      UnsetDevelopmentCycleMin: (message) =>
        developmentCycleMinOperations.unset.handler(document, message),
      SetHeightMax: (message) => heightMaxOperations.set.handler(document, message),
      UnsetHeightMax: (message) => heightMaxOperations.unset.handler(document, message),
      SetHeightMin: (message) => heightMinOperations.set.handler(document, message),
      UnsetHeightMin: (message) => heightMinOperations.unset.handler(document, message),
      SetTemperatureMax: (message) => temperatureMaxOperations.set.handler(document, message),
      UnsetTemperatureMax: (message) => temperatureMaxOperations.unset.handler(document, message),
      SetTemperatureMin: (message) => temperatureMinOperations.set.handler(document, message),
      UnsetTemperatureMin: (message) => temperatureMinOperations.unset.handler(document, message),
    }),
  )
