import { expect, it } from "@effect/vitest"
import { Option } from "effect"

import { gelVegetableNamesToCrdtList } from "./gel-vegetable-to-wiki-plant-article.js"

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
