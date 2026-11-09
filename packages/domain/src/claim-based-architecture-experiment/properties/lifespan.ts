import { Schema } from "effect"

import { PartialDate } from "../../common/utils/dates.js"
import { defineProperty } from "../property.js"

/** Today's `birthDate` and `deathDate`. See `activePeriod` on ordering partial dates. */
export const LifespanProperty = defineProperty({
  id: "lifespan",
  valueSchema: Schema.Struct({
    born: Schema.optionalKey(PartialDate),
    died: Schema.optionalKey(PartialDate),
  }),
  kinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
