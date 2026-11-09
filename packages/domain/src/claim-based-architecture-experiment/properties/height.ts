import * as Quantity from "effect-units/Quantity"

import { Centimeters } from "../../common/primitives.js"
import { defineProperty } from "../property.js"
import { makeRange } from "../values/range.js"

/** Today's `heightMin` and `heightMax`, one value so the invariant is the schema's. */
export const HeightProperty = defineProperty({
  id: "height",
  value: makeRange({
    bound: Centimeters,
    isLessThanOrEqual: Quantity.isLessThanOrEqualTo,
    identifier: "HeightRange",
    title: "Height range",
  }),
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
