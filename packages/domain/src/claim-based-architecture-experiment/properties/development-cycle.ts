import { IntNonNegative } from "../../common/primitives.js"
import { defineProperty } from "../property.js"
import { makeRange } from "../values/range.js"

/** In days. */
export const DevelopmentCycleProperty = defineProperty({
  id: "developmentCycle",
  value: makeRange({
    bound: IntNonNegative,
    isLessThanOrEqual: (self, that) => self <= that,
    identifier: "DevelopmentCycleRange",
    title: "Development cycle range",
  }),
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
