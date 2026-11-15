import { Option } from "effect"

import { GrowthForm } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * Syntropedia's "forma de crescimento".
 *
 * A botanical fact: Syntropedia's answer is canonical over people's proposals.
 */
export const GrowthFormProperty = defineCanonicalProperty({
  id: "growthForm",
  valueSchema: GrowthForm,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.syntropedia({
      extract: (plant) => Option.toArray(Option.fromNullishOr(plant.growthForm)).map(source.found),
    }),
    source.person(),
  ],
  inheritance: { through: ["cultivarOf"], mode: "BY_CHOICE" },
})
