import { Option } from "effect"

import { CrownShape } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

/** A botanical fact: Syntropedia's answer is canonical over people's proposals. */
export const CrownShapeProperty = defineCanonicalProperty({
  id: "crownShape",
  valueSchema: CrownShape,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.syntropedia({
      extract: (plant) => Option.toArray(Option.fromNullishOr(plant.crownShape)).map(source.found),
    }),
    source.person(),
  ],
  inheritance: { through: ["cultivarOf"], mode: "BY_CHOICE" },
})
