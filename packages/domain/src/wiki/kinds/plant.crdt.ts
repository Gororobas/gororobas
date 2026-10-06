import { Effect, Schema } from "effect"
import { LoroMap } from "loro-crdt"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantingMethod,
  PlantLifecycle,
  PlantUsage,
} from "../../common/enums.js"
import { WikidataId } from "../../common/external-identifiers.js"
import {
  Centimeters,
  IntNonNegative,
  NameInCrdtList,
  TemperatureInCelsius,
} from "../../common/primitives.js"
import { defineCrdtOperations } from "../../crdts/define-crdt-operations.js"
import { CrdtContainerNotFoundError, InvalidCrdtUpdateError } from "../../crdts/errors.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { makeOptionalTranslatedScalarEditOperations } from "../../crdts/optional-translated-scalar-edit-operations.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import type { PlantEditableArticle, PlantEditableAttributes } from "./plant.js"

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

const wikidataIdOperations = makeOptionalScalarEditOperations("WikidataId")({
  ValueSchema: WikidataId,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "wikidataId" satisfies keyof PlantEditableAttributes,
})

const originOperations = makeOptionalTranslatedScalarEditOperations("PlantOrigin")({
  ValueSchema: Schema.String,
  // @todo I believe this can go into `makeOptionalTranslatedScalarEditOperations`, I don't see a reason to repeat this on every operation
  getParentContainer: (document, locale) =>
    Effect.gen(function* () {
      if (document.getMap("kind").get("value") !== "PLANT") {
        return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
      }

      const translation = document.getMap("translations").get(locale)
      if (!(translation instanceof LoroMap)) {
        return yield* new CrdtContainerNotFoundError({ path: ["translations", locale] })
      }

      return translation
    }),
  keyInParentContainer: "origin" satisfies keyof NonNullable<
    PlantEditableArticle["translations"]["en"]
  >,
})

export const WikiPlantArticleCrdtOperations = defineCrdtOperations([
  ...originOperations,
  ...developmentCycleMaxOperations,
  ...developmentCycleMinOperations,
  ...ediblePartsOperations,
  ...heightMaxOperations,
  ...heightMinOperations,
  ...plantLifecycleOperations,
  ...plantUsageOperations,
  ...plantingMethodOperations,
  ...scientificNameOperations,
  ...strataOperations,
  ...temperatureMaxOperations,
  ...temperatureMinOperations,
  ...wikidataIdOperations,
])

export type WikiPlantArticleAttributeEdit = typeof WikiPlantArticleCrdtOperations.AttributeEdit.Type
