import { Option } from "effect"

import { SuccessionalGroup } from "../../common/enums.js"
import { defineSituatedProperty } from "../property.js"

/** Situated, as for `strata`: Syntropedia is one source among the people who grow the plant. */
export const SuccessionalGroupProperty = defineSituatedProperty({
  id: "successionalGroup",
  valueSchema: SuccessionalGroup,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    syntropedia: source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.successionalGroup)).map(source.found),
    }),
    person: source.person({ inferable: true }),
  }),
  summary: (summarize) => summarize.wholeValues(),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
