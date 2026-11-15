import { Option } from "effect"

import { GrowthRate } from "../../common/enums.js"
import { defineSituatedProperty } from "../property.js"

export const GrowthRateProperty = defineSituatedProperty({
  id: "growthRate",
  valueSchema: GrowthRate,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    syntropedia: source.syntropedia({
      extract: (plant) => Option.toArray(Option.fromNullishOr(plant.growthRate)).map(source.found),
    }),
  }),
  summary: (summarize) => summarize.wholeValues(),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
