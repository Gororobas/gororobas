import { Schema } from "effect"

import { PartialDate } from "../../common/utils/dates.js"
import { defineProperty } from "../property.js"

/**
 * Today's `foundedDate` and `dissolvedDate`, bundled like ranges. Unlike ranges, there's no
 * ordering check: partial dates at different precisions ("2010" and "2010-03") don't order.
 */
export const ActivePeriodProperty = defineProperty({
  id: "activePeriod",
  valueSchema: Schema.Struct({
    founded: Schema.optionalKey(PartialDate),
    dissolved: Schema.optionalKey(PartialDate),
  }),
  kinds: ["NOTEWORTHY_ENTITY"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
})
