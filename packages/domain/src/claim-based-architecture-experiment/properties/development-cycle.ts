import { IntNonNegative } from "../../common/primitives.js"
import { defineProperty } from "../property.js"
import { makeRange } from "../values/range.js"

/** In days. */
export const DevelopmentCycleProperty = defineProperty({
  id: "developmentCycle",
  valueSchema: makeRange({
    bound: IntNonNegative,
    isLessThanOrEqual: (self, that) => self <= that,
    identifier: "DevelopmentCycleRange",
    title: "Development cycle range",
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
})
