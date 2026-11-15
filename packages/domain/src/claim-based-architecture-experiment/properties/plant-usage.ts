import { Option } from "effect"

import { PlantUsage } from "../../common/enums.js"
import { NonEmptySet, nonEmptySetOf } from "../../common/sets.js"
import { defineSituatedProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"

export const PlantUsageProperty = defineSituatedProperty({
  id: "plantUsage",
  valueSchema: NonEmptySet(PlantUsage),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    syntropedia: source.syntropedia({
      extract: (plant) =>
        Option.toArray(nonEmptySetOf(Syntropedia.plantUsages(plant))).map(source.found),
    }),
  }),
  summary: (summarize) => summarize.eachMember(PlantUsage),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
