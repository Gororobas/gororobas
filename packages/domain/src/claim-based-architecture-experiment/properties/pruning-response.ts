import { Option } from "effect"

import { PruningResponse } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/** Syntropedia's "resposta à poda". */
export const PruningResponseProperty = defineProperty({
  id: "pruningResponse",
  valueSchema: PruningResponse,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.pruningResponse)).map(source.found),
    }),
  ],
})
