import { Option } from "effect"

import { CrownShape } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const CrownShapeProperty = defineProperty({
  id: "crownShape",
  valueSchema: CrownShape,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) => Option.toArray(Option.fromNullishOr(plant.crownShape)).map(source.found),
    }),
  ],
})
