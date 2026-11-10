import { Option } from "effect"

import { LeafPersistence } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/** Syntropedia's "perda foliar". */
export const LeafPersistenceProperty = defineProperty({
  id: "leafPersistence",
  valueSchema: LeafPersistence,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.leafPersistence)).map(source.found),
    }),
  ],
})
