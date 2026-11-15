import { IntNonNegative } from "../../common/primitives.js"
import { makeRange } from "../../common/range.js"
import { defineSituatedProperty } from "../property.js"

/**
 * Days from planting to the first harvest. People give the number they saw, a single one (`min`
 * equal to `max`) or a range, and the summary spans everyone's.
 */
export const DevelopmentCycleProperty = defineSituatedProperty({
  id: "developmentCycle",
  valueSchema: makeRange({
    bound: IntNonNegative,
    isLessThanOrEqual: (self, that) => self <= that,
    identifier: "DevelopmentCycleRange",
    title: "Development cycle range",
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({ person: source.person({ inferable: true }) }),
  summary: (summarize) => summarize.range((days) => days),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
