import * as Temperature from "effect-units/Temperature"

import { TemperatureInCelsius } from "../../common/primitives.js"
import { defineProperty } from "../property.js"
import { makeRange } from "../values/range.js"

export const TemperatureProperty = defineProperty({
  id: "temperature",
  value: makeRange({
    bound: TemperatureInCelsius,
    isLessThanOrEqual: Temperature.isLessThanOrEqualTo,
    identifier: "TemperatureRange",
    title: "Temperature range",
  }),
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
