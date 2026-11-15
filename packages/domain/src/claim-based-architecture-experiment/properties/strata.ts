import { Option } from "effect"

import { AgroforestryStratum } from "../../common/enums.js"
import { NonEmptySet, nonEmptySetOf } from "../../common/sets.js"
import { defineSituatedProperty } from "../property.js"

/**
 * Situated: which stratum a plant takes depends on the system it grows in and who designed it.
 * Syntropedia, which specializes in strata, is one source among the people who grow it.
 */
export const StrataProperty = defineSituatedProperty({
  id: "strata",
  valueSchema: NonEmptySet(AgroforestryStratum),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({
    syntropedia: source.syntropedia({
      extract: (plant) => Option.toArray(nonEmptySetOf(plant.strata)).map(source.found),
    }),
    person: source.person({ inferable: true }),
  }),
  summary: (summarize) => summarize.eachMember(AgroforestryStratum),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
