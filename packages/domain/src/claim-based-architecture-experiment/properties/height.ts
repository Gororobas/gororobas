import { Option } from "effect"
import * as Length from "effect-units/Length"
import * as Quantity from "effect-units/Quantity"

import { Centimeters } from "../../common/primitives.js"
import { makeRange } from "../../common/range.js"
import { defineSituatedProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"

/** One value, so the invariant is the schema's. */
export const HeightProperty = defineSituatedProperty({
  id: "height",
  valueSchema: makeRange({
    bound: Centimeters,
    isLessThanOrEqual: Quantity.isLessThanOrEqualTo,
    identifier: "HeightRange",
    title: "Height range",
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    syntropedia: source.syntropedia({
      extract: (plant) => Syntropedia.height(plant).pipe(Option.toArray).map(source.found),
    }),
  }),
  summary: (summarize) => summarize.range(Length.inCentimeters),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
  schemaOrg: {
    // One value of ours is a range; schema.org's `height` is a single quantity or a range of one.
    match: "CLOSE",
    encode: ({ min, max }) => ({
      height: {
        "@type": "QuantitativeValue",
        unitCode: "CMT",
        ...(min === undefined ? {} : { minValue: Length.inCentimeters(min) }),
        ...(max === undefined ? {} : { maxValue: Length.inCentimeters(max) }),
      },
    }),
  },
})
