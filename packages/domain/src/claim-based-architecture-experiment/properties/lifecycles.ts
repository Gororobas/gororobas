import { PlantLifecycle } from "../../common/enums.js"
import { NonEmptySet } from "../../common/sets.js"
import { defineSituatedProperty } from "../property.js"

export const LifecyclesProperty = defineSituatedProperty({
  id: "lifecycles",
  valueSchema: NonEmptySet(PlantLifecycle),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({ person: source.person({ inferable: true }) }),
  summary: (summarize) => summarize.eachMember(PlantLifecycle),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
