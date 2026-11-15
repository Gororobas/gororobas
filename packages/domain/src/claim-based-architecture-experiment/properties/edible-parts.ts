import { EdiblePlantPart } from "../../common/enums.js"
import { NonEmptySet } from "../../common/sets.js"
import { defineSituatedProperty } from "../property.js"

export const EdiblePartsProperty = defineSituatedProperty({
  id: "edibleParts",
  valueSchema: NonEmptySet(EdiblePlantPart),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  sources: (source) => ({ person: source.person({ inferable: true }) }),
  summary: (summarize) => summarize.eachMember(EdiblePlantPart),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
