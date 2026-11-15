import { Option } from "effect"
import * as Length from "effect-units/Length"
import * as Quantity from "effect-units/Quantity"

import { Centimeters } from "../../common/primitives.js"
import { makeRange } from "../../common/range.js"
import { defineSituatedProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"

/** How wide the crown spreads when grown, which spacing in an agroforest follows. */
export const CrownDiameterProperty = defineSituatedProperty({
  id: "crownDiameter",
  valueSchema: makeRange({
    bound: Centimeters,
    isLessThanOrEqual: Quantity.isLessThanOrEqualTo,
    identifier: "CrownDiameterRange",
    title: "Crown diameter range",
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    syntropedia: source.syntropedia({
      extract: (plant) => Syntropedia.crownDiameter(plant).pipe(Option.toArray).map(source.found),
    }),
  }),
  summary: (summarize) => summarize.range(Length.inCentimeters),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
