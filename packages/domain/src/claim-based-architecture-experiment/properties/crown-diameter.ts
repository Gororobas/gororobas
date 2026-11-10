import { Option } from "effect"
import * as Quantity from "effect-units/Quantity"

import { Centimeters } from "../../common/primitives.js"
import { defineProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"
import { makeRange } from "../values/range.js"

/** How wide the crown spreads when grown, which spacing in an agroforest follows. */
export const CrownDiameterProperty = defineProperty({
  id: "crownDiameter",
  valueSchema: makeRange({
    bound: Centimeters,
    isLessThanOrEqual: Quantity.isLessThanOrEqualTo,
    identifier: "CrownDiameterRange",
    title: "Crown diameter range",
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) => Syntropedia.crownDiameter(plant).pipe(Option.toArray).map(source.found),
    }),
  ],
})
