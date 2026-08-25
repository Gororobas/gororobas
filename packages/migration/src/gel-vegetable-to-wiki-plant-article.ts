import {
  AgroforestryStratum,
  Centimeters,
  EdiblePlantPart,
  LoroListItemId,
  NameInCrdtList,
  PlantLifecycle,
  PlantUsage,
  PlantingMethod,
  TemperatureInCelsius,
  WikiPlantArticle,
} from "@gororobas/domain"
import { HashSet, Option, Schema } from "effect"

import { type GelVegetable } from "./schemas/gel/entities.js"
import {
  GelEdiblePart,
  GelPlantingMethod,
  GelStratum,
  GelVegetableLifeCycle,
  GelVegetableUsage,
} from "./schemas/gel/enums.js"

const hashNameToLoroListItemId = (name: string): LoroListItemId =>
  LoroListItemId.make(
    [2166136261, 2654435761, 2246822519]
      .map(
        (initialHash, hashIndex) =>
          Array.from(name).reduce(
            (hash, character) => Math.imul(hash ^ (character.charCodeAt(0) + hashIndex), 16777619),
            initialHash,
          ) >>> 0,
      )
      .map((hash) =>
        [0, 6, 12, 18].map(
          (shift) =>
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-"[
              (hash >>> shift) & 63
            ],
        ),
      )
      .flat()
      .join("")
      .slice(0, 12),
  )

const namesToCrdtList = (names: ReadonlyArray<string>) =>
  names.map((value) =>
    Schema.decodeUnknownSync(NameInCrdtList)({
      id: hashNameToLoroListItemId(value),
      value,
    }),
  )

export const gelVegetableNamesToCrdtList = (names: ReadonlyArray<string>) =>
  Schema.decodeUnknownSync(Schema.NonEmptyArray(NameInCrdtList))(namesToCrdtList(names))

const stratumMap: Record<typeof GelStratum.Type, AgroforestryStratum> = {
  EMERGENTE: "EMERGENT",
  ALTO: "HIGH",
  MEDIO: "MEDIUM",
  BAIXO: "LOW",
  RASTEIRO: "GROUND",
}

const plantingMethodMap: Record<typeof GelPlantingMethod.Type, PlantingMethod> = {
  BROTO: "SEEDLING",
  ENXERTO: "GRAFT",
  ESTACA: "STEM_CUTTING",
  RIZOMA: "RHIZOME",
  SEMENTE: "SEED",
  TUBERCULO: "TUBER",
}

const ediblePartMap: Record<typeof GelEdiblePart.Type, EdiblePlantPart> = {
  FRUTO: "FRUIT",
  FLOR: "FLOWER",
  FOLHA: "LEAF",
  CAULE: "STEM",
  SEMENTE: "SEED",
  CASCA: "BARK",
  BULBO: "BULB",
  BROTO: "SPROUT",
  RAIZ: "ROOT",
  TUBERCULO: "TUBER",
  RIZOMA: "RHIZOME",
}

const lifecycleMap: Record<typeof GelVegetableLifeCycle.Type, PlantLifecycle> = {
  SEMESTRAL: "SEMIANNUAL",
  ANUAL: "ANNUAL",
  BIENAL: "BIENNIAL",
  PERENE: "PERENNIAL",
}

const usageMap: Record<typeof GelVegetableUsage.Type, PlantUsage> = {
  ALIMENTO_ANIMAL: "ANIMAL_FEED",
  ALIMENTO_HUMANO: "HUMAN_FEED",
  CONSTRUCAO: "CONSTRUCTION",
  MATERIA_ORGANICA: "ORGANIC_MATTER",
  MEDICINAL: "MEDICINAL",
  COSMETICO: "COSMETIC",
  ORNAMENTAL: "ORNAMENTAL",
  RITUALISTICO: "RITUALISTIC",
  ECOLOGICO: "ECOSYSTEM_SERVICE",
}

const toSet = <Source extends string, Target extends string>(
  values: Option.Option<ReadonlyArray<Source>>,
  map: (value: Source) => Target,
) => Option.map(values, (items) => HashSet.fromIterable(items.map(map)))

export const gelVegetableToPlantEditableAttributes = (
  vegetable: GelVegetable,
): typeof WikiPlantArticle.EditableAttributes.Type =>
  WikiPlantArticle.EditableAttributes.make({
    developmentCycleMax: Option.map(
      Option.fromNullishOr(vegetable.development_cycle_max),
      (value) => Schema.decodeUnknownSync(Centimeters)(value),
    ),
    developmentCycleMin: Option.map(
      Option.fromNullishOr(vegetable.development_cycle_min),
      (value) => Schema.decodeUnknownSync(Centimeters)(value),
    ),
    heightMax: Option.map(Option.fromNullishOr(vegetable.height_max), (value) =>
      Schema.decodeUnknownSync(Centimeters)(value),
    ),
    heightMin: Option.map(Option.fromNullishOr(vegetable.height_min), (value) =>
      Schema.decodeUnknownSync(Centimeters)(value),
    ),
    temperatureMax: Option.map(Option.fromNullishOr(vegetable.temperature_max), (value) =>
      Schema.decodeUnknownSync(TemperatureInCelsius)(value),
    ),
    temperatureMin: Option.map(Option.fromNullishOr(vegetable.temperature_min), (value) =>
      Schema.decodeUnknownSync(TemperatureInCelsius)(value),
    ),
    scientificNames: Option.map(Option.fromNullishOr(vegetable.scientific_names), namesToCrdtList),
    edibleParts: toSet(
      Option.fromNullishOr(vegetable.edible_parts),
      (value) => ediblePartMap[value],
    ),
    lifecycles: toSet(Option.fromNullishOr(vegetable.lifecycles), (value) => lifecycleMap[value]),
    plantingMethods: toSet(
      Option.fromNullishOr(vegetable.planting_methods),
      (value) => plantingMethodMap[value],
    ),
    strata: toSet(Option.fromNullishOr(vegetable.strata), (value) => stratumMap[value]),
    usage: toSet(Option.fromNullishOr(vegetable.uses), (value) => usageMap[value]),
  })
