import { expect, it } from "@effect/vitest"
import {
  LoroDocSnapshot,
  LoroDocUpdate,
  WikiArticleCrdt,
  WikiArticleId,
  WikiPlantCultivarArticle,
} from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"
import { LoroDoc } from "loro-crdt"

import { GelVegetable } from "../schemas/gel/entities.js"
import { buildWikiMigrationHistory } from "../wiki-migration-history.js"
import {
  gelVegetableNamesToCrdtList,
  gelVegetableToPlantEditableAttributes,
} from "./gel-vegetable-to-wiki-plant-article.js"

it.effect("replays migrated cultivar revisions with their parent and traits", () =>
  Effect.gen(function* () {
    const parentPlantId = WikiArticleId.make("00000000-0000-7000-8000-000000000001")

    const article = WikiPlantCultivarArticle.EditableArticle.make({
      kind: "PLANT_CULTIVAR",
      attributes: WikiPlantCultivarArticle.EditableAttributes.make({
        parentPlantId,
        edibleParts: { _tag: "Value", value: ["FRUIT"] },
      }),
      translations: {
        pt: {
          commonNames: gelVegetableNamesToCrdtList(["Banana da terra"]),
          content: Option.none(),
        },
      },
    })

    const versions = yield* buildWikiMigrationHistory([
      {
        article,
        sourceEditId: null,
        actorId: null,
        reviewerId: null,
        timestamp: "2025-04-01T12:00:00Z",
      },
    ])

    const snapshot = LoroDocSnapshot.make(Buffer.from(versions[0].loroSnapshot, "base64"))
    const document = new LoroDoc()
    document.import(snapshot)
    const parsed = yield* WikiArticleCrdt.parseUpdate({
      snapshot,
      crdtUpdate: LoroDocUpdate.make(document.export({ mode: "update" })),
    })
    expect(parsed.data).toEqual(article)
  }),
)
import { plantAttributesToCultivar } from "./gel-vegetable-to-wiki-plant-cultivar-article.js"

it("preserves representable plant attributes when converting to a cultivar", () => {
  const plant = Schema.decodeSync(GelVegetable)({
    id: "gel-plant",
    handle: "banana-da-terra",
    names: ["Banana da terra"],
    created_at: Schema.decodeSync(Schema.DateFromString)("2025-04-01T12:00:00Z"),
    updated_at: null,
    scientific_names: ["Musa"],
    edible_parts: ["FRUTO"],
    development_cycle_min: 100,
    development_cycle_max: 200,
    height_min: 50,
  })

  const parentPlantId = WikiArticleId.make("00000000-0000-7000-8000-000000000001")
  const result = plantAttributesToCultivar(
    gelVegetableToPlantEditableAttributes(plant),
    parentPlantId,
  )
  expect(result.parentPlantId).toBe(parentPlantId)
  expect(result.scientificNames).toEqual({ _tag: "Value", value: ["Musa"] })
  expect(result.edibleParts).toEqual({ _tag: "Value", value: ["FRUIT"] })
  expect(result.developmentCycle).toEqual({ _tag: "Value", value: { min: 100, max: 200 } })
  expect(result.height).toEqual({ _tag: "Unknown" })
})

it.each([
  { handle: "arroz", scientificNames: [], expected: ["Oryza spp."] },
  { handle: "cenoura", scientificNames: null, expected: ["Daucus carota subsp. sativus"] },
  { handle: "cenoura", scientificNames: undefined, expected: ["Daucus carota subsp. sativus"] },
  { handle: "arroz", scientificNames: ["Oryza glaberrima"], expected: ["Oryza glaberrima"] },
  { handle: "planta-desconhecida", scientificNames: [], expected: undefined },
])("repairs missing scientific names for $handle without replacing supplied names", (testCase) => {
  const plant = Schema.decodeSync(GelVegetable)({
    id: "gel-plant",
    handle: testCase.handle,
    names: [testCase.handle],
    created_at: Schema.decodeSync(Schema.DateFromString)("2025-04-01T12:00:00Z"),
    updated_at: null,
    scientific_names: testCase.scientificNames,
  })

  const attributes = gelVegetableToPlantEditableAttributes(plant)
  expect(Option.getOrUndefined(attributes.scientificNames)?.map(({ value }) => value)).toEqual(
    testCase.expected,
  )
})

it.each([
  { gender: "FEMININO", expected: "FEMALE" },
  { gender: "MASCULINO", expected: "MALE" },
  { gender: "NEUTRO", expected: "NEUTRAL" },
  { gender: null, expected: undefined },
  { gender: undefined, expected: undefined },
] as const)("assigns Gel gender $gender only to the first common name", ({ gender, expected }) => {
  const names = gelVegetableNamesToCrdtList([" Mandioca ", "Aipim", "Macaxeira"], gender)

  expect(names.map(({ name, grammaticalGender }) => ({ name, grammaticalGender }))).toEqual([
    { name: "Mandioca", grammaticalGender: Option.fromUndefinedOr(expected) },
    { name: "Aipim", grammaticalGender: Option.none() },
    { name: "Macaxeira", grammaticalGender: Option.none() },
  ])

  expect(names.map(({ id }) => id)).toEqual(
    gelVegetableNamesToCrdtList(["Mandioca", "Aipim", "Macaxeira"]).map(({ id }) => id),
  )
})
