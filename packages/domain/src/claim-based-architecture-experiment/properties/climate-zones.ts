import { Option } from "effect"

import { ClimateZone } from "../../common/enums.js"
import { NonEmptySet, nonEmptySetOf } from "../../common/sets.js"
import { defineSituatedProperty } from "../property.js"

/** Syntropedia's "bioma de ocorrência", which names climates rather than biomes. */
export const ClimateZonesProperty = defineSituatedProperty({
  id: "climateZones",
  valueSchema: NonEmptySet(ClimateZone),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    syntropedia: source.syntropedia({
      extract: (plant) => Option.toArray(nonEmptySetOf(plant.climateZones)).map(source.found),
    }),
  }),
  summary: (summarize) => summarize.eachMember(ClimateZone),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
