import { expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"

import { GelVegetable } from "../schemas/gel/entities.js"
import {
  gelVegetableNamesToCrdtList,
  gelVegetableToPlantEditableAttributes,
} from "./gel-vegetable-to-wiki-plant-article.js"

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
