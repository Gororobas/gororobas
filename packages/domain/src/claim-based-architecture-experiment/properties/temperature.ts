import * as Temperature from "effect-units/Temperature"

import { TemperatureInCelsius } from "../../common/primitives.js"
import { makeRange } from "../../common/range.js"
import { defineSituatedProperty } from "../property.js"

export const TemperatureProperty = defineSituatedProperty({
  id: "temperature",
  valueSchema: makeRange({
    bound: TemperatureInCelsius,
    isLessThanOrEqual: Temperature.isLessThanOrEqualTo,
    identifier: "TemperatureRange",
    title: "Temperature range",
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({ person: source.person({ inferable: true }) }),
  summary: (summarize) => summarize.range(Temperature.inDegreesCelsius),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
