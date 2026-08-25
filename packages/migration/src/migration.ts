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
import { Array as EffectArray, Effect, HashSet, Option, Schema } from "effect"
import { Command } from "effect/unstable/cli"

import { GelClient } from "./gel-client.js"
import { VegetableInGel } from "./schemas/gel/entities.js"
import {
  EdiblePart,
  PlantingMethod as GelPlantingMethod,
  Stratum,
  VegetableLifeCycle,
  VegetableUsage,
} from "./schemas/gel/enums.js"

/**
 * Derive the CRDT list identifier from the value instead of generating a
 * random identifier, so rerunning the migration produces the same document.
 */
export const hashNameToLoroListItemId = (name: string): LoroListItemId =>
  LoroListItemId.make(
    [2166136261, 2654435761, 2246822519]
      .map((initialHash, hashIndex) => {
        return (
          Array.from(name).reduce(
            (hash, character) => Math.imul(hash ^ (character.charCodeAt(0) + hashIndex), 16777619),
            initialHash,
          ) >>> 0
        )
      })
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

export const namesToCrdtList = (names: ReadonlyArray<string>) =>
  names.map((value) =>
    Schema.decodeUnknownSync(NameInCrdtList)({
      id: hashNameToLoroListItemId(value),
      value,
    }),
  )

const stratumMap: Record<Stratum, AgroforestryStratum> = {
  EMERGENTE: "EMERGENT",
  ALTO: "HIGH",
  MEDIO: "MEDIUM",
  BAIXO: "LOW",
  RASTEIRO: "GROUND",
}

const plantingMethodMap: Record<GelPlantingMethod, PlantingMethod> = {
  BROTO: "SEEDLING",
  ENXERTO: "GRAFT",
  ESTACA: "STEM_CUTTING",
  RIZOMA: "RHIZOME",
  SEMENTE: "SEED",
  TUBERCULO: "TUBER",
}

const ediblePartMap: Record<EdiblePart, EdiblePlantPart> = {
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

const lifecycleMap: Record<VegetableLifeCycle, PlantLifecycle> = {
  SEMESTRAL: "SEMIANNUAL",
  ANUAL: "ANNUAL",
  BIENAL: "BIENNIAL",
  PERENE: "PERENNIAL",
}

const usageMap: Record<VegetableUsage, PlantUsage> = {
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

export const vegetableToPlantEditableAttributes = (
  vegetable: VegetableInGel,
): typeof WikiPlantArticle.EditableAttributes.Type =>
  WikiPlantArticle.EditableAttributes.make({
    developmentCycleMax: Option.map(vegetable.development_cycle_max, (value) =>
      Schema.decodeUnknownSync(Centimeters)(value),
    ),
    developmentCycleMin: Option.map(vegetable.development_cycle_min, (value) =>
      Schema.decodeUnknownSync(Centimeters)(value),
    ),
    heightMax: Option.map(vegetable.height_max, (value) =>
      Schema.decodeUnknownSync(Centimeters)(value),
    ),
    heightMin: Option.map(vegetable.height_min, (value) =>
      Schema.decodeUnknownSync(Centimeters)(value),
    ),
    temperatureMax: Option.map(vegetable.temperature_max, (value) =>
      Schema.decodeUnknownSync(TemperatureInCelsius)(value),
    ),
    temperatureMin: Option.map(vegetable.temperature_min, (value) =>
      Schema.decodeUnknownSync(TemperatureInCelsius)(value),
    ),
    scientificNames: Option.map(vegetable.scientific_names, namesToCrdtList),
    edibleParts: toSet(vegetable.edible_parts, (value) => ediblePartMap[value]),
    lifecycles: toSet(vegetable.lifecycles, (value) => lifecycleMap[value]),
    plantingMethods: toSet(vegetable.planting_methods, (value) => plantingMethodMap[value]),
    strata: toSet(vegetable.strata, (value) => stratumMap[value]),
    usage: toSet(vegetable.uses, (value) => usageMap[value]),
  })

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const gelClient = yield* GelClient
    const vegetableResults = yield* gelClient
      .use((client) => client.query("select Vegetable { * }"))
      .pipe(
        Effect.tap(Effect.logInfo),
        Effect.flatMap((vegetables) =>
          Effect.all(
            vegetables.map((v) => Schema.decodeUnknownEffect(VegetableInGel)(v)),
            {
              concurrency: "unbounded",
              mode: "result",
            },
          ),
        ),
      )

    const vegetables = EffectArray.getSuccesses(vegetableResults)
    yield* Option.match(EffectArray.head(vegetables), {
      onNone: () => Effect.void,
      onSome: (vegetable) =>
        Effect.log("Example plant attributes", vegetableToPlantEditableAttributes(vegetable)),
    })

    const failures = EffectArray.getFailures(vegetableResults)
    yield* Option.match(EffectArray.head(failures), {
      onNone: () => Effect.void,
      onSome: (failure) => Effect.log(failure.message),
    })
  }),
).pipe(Command.withDescription("Fetch vegetables from Gel"))
