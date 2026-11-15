import { makeRange } from "../../common/range.js"
import { PartialDate, isPartialDateNotAfter } from "../../common/utils/dates.js"
import { defineCanonicalProperty } from "../property.js"

export const ActivePeriodProperty = defineCanonicalProperty({
  id: "activePeriod",
  valueSchema: makeRange({
    bound: PartialDate,
    keys: { min: "founded", max: "dissolved" },
    isLessThanOrEqual: isPartialDateNotAfter,
    identifier: "ActivePeriod",
    title: "Active period",
  }),
  kinds: ["NOTEWORTHY_ENTITY"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
})
