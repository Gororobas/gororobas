import { Option } from "effect"

import { PlantingMethod } from "../../common/enums.js"
import { NonEmptySet, nonEmptySetOf } from "../../common/sets.js"
import { defineSituatedProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"

export const PlantingMethodsProperty = defineSituatedProperty({
  id: "plantingMethods",
  valueSchema: NonEmptySet(PlantingMethod),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    syntropedia: source.syntropedia({
      extract: (plant) =>
        Option.toArray(nonEmptySetOf(Syntropedia.plantingMethods(plant))).map(source.found),
    }),
  }),
  summary: (summarize) => summarize.eachMember(PlantingMethod),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
