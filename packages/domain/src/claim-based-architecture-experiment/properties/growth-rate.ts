import { Option } from "effect"

import { GrowthRate } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const GrowthRateProperty = defineProperty({
  id: "growthRate",
  valueSchema: GrowthRate,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) => Option.toArray(Option.fromNullishOr(plant.growthRate)).map(source.found),
    }),
  ],
})
