import { Option } from "effect"

import { SuccessionalGroup } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/** Syntropedia ranks first, as for `strata`: succession is what it specializes in. */
export const SuccessionalGroupProperty = defineProperty({
  id: "successionalGroup",
  valueSchema: SuccessionalGroup,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.successionalGroup)).map(source.found),
    }),
    source.person(),
  ],
})
