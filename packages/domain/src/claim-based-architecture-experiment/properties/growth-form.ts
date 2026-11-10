import { Option } from "effect"

import { GrowthForm } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/** Syntropedia's "forma de crescimento". */
export const GrowthFormProperty = defineProperty({
  id: "growthForm",
  valueSchema: GrowthForm,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) => Option.toArray(Option.fromNullishOr(plant.growthForm)).map(source.found),
    }),
  ],
})
