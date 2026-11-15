import { Option } from "effect"

import { LeafPersistence } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * Syntropedia's "perda foliar". A botanical fact: Syntropedia's answer is canonical over people's
 * proposals.
 */
export const LeafPersistenceProperty = defineCanonicalProperty({
  id: "leafPersistence",
  valueSchema: LeafPersistence,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.leafPersistence)).map(source.found),
    }),
    source.person(),
  ],
  inheritance: { through: ["cultivarOf"], mode: "BY_CHOICE" },
})
