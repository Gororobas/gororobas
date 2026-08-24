import { Effect } from "effect"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../../common/enums.js"
import {
  Centimeters,
  IntNonNegative,
  NameInCrdtList,
  TemperatureInCelsius,
} from "../../common/primitives.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
import type { PlantEditableAttributes } from "./plant.js"

const scientificNameOperations = makeMovableListEditOperations("ScientificName")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("scientificNames" satisfies keyof PlantEditableAttributes),
    ),
})

const plantLifecycleOperations = makeStringSetEditOperations("PlantLifecycle")({
  ValueSchema: PlantLifecycle,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("lifecycles" satisfies keyof PlantEditableAttributes),
    ),
})

const plantingMethodOperations = makeStringSetEditOperations("PlantingMethod")({
  ValueSchema: PlantingMethod,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("plantingMethods" satisfies keyof PlantEditableAttributes),
    ),
})

const plantUsageOperations = makeStringSetEditOperations("PlantUsage")({
  ValueSchema: PlantUsage,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("usage" satisfies keyof PlantEditableAttributes),
    ),
})

const ediblePartsOperations = makeStringSetEditOperations("EdibleParts")({
  ValueSchema: EdiblePlantPart,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("edibleParts" satisfies keyof PlantEditableAttributes),
    ),
})

const strataOperations = makeStringSetEditOperations("Strata")({
  ValueSchema: AgroforestryStratum,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("strata" satisfies keyof PlantEditableAttributes),
    ),
})

const developmentCycleMaxOperations = makeOptionalScalarEditOperations("DevelopmentCycleMax")({
  ValueSchema: IntNonNegative,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "developmentCycleMax" satisfies keyof PlantEditableAttributes,
})

const developmentCycleMinOperations = makeOptionalScalarEditOperations("DevelopmentCycleMin")({
  ValueSchema: IntNonNegative,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "developmentCycleMin" satisfies keyof PlantEditableAttributes,
})

const heightMaxOperations = makeOptionalScalarEditOperations("HeightMax")({
  ValueSchema: Centimeters,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "heightMax" satisfies keyof PlantEditableAttributes,
})

const heightMinOperations = makeOptionalScalarEditOperations("HeightMin")({
  ValueSchema: Centimeters,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "heightMin" satisfies keyof PlantEditableAttributes,
})

const temperatureMaxOperations = makeOptionalScalarEditOperations("TemperatureMax")({
  ValueSchema: TemperatureInCelsius,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "temperatureMax" satisfies keyof PlantEditableAttributes,
})

const temperatureMinOperations = makeOptionalScalarEditOperations("TemperatureMin")({
  ValueSchema: TemperatureInCelsius,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "temperatureMin" satisfies keyof PlantEditableAttributes,
})

export const WikiPlantArticleCrdtOperations = defineKindCrdtOperations([
  ...scientificNameOperations,
  ...plantLifecycleOperations,
  ...plantingMethodOperations,
  ...plantUsageOperations,
  ...strataOperations,
  ...ediblePartsOperations,
  ...developmentCycleMaxOperations,
  ...developmentCycleMinOperations,
  ...heightMaxOperations,
  ...heightMinOperations,
  ...temperatureMaxOperations,
  ...temperatureMinOperations,
])
export type WikiPlantArticleAttributeEdit = typeof WikiPlantArticleCrdtOperations.AttributeEdit.Type
