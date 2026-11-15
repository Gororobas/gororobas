import { Option } from "effect"

import { PruningResponse } from "../../common/enums.js"
import { defineSituatedProperty } from "../property.js"

/** Syntropedia's "resposta à poda". */
export const PruningResponseProperty = defineSituatedProperty({
  id: "pruningResponse",
  valueSchema: PruningResponse,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    syntropedia: source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.pruningResponse)).map(source.found),
    }),
  }),
  summary: (summarize) => summarize.wholeValues(),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
