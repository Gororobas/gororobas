import { Option } from "effect"

import { SeedStorageBehavior } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const SeedStorageBehaviorProperty = defineProperty({
  id: "seedStorageBehavior",
  valueSchema: SeedStorageBehavior,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.seedStorageBehavior)).map(source.found),
    }),
  ],
})
