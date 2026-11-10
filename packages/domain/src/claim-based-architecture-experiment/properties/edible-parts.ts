import { EdiblePlantPart } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const EdiblePartsProperty = defineProperty({
  id: "edibleParts",
  valueSchema: EdiblePlantPart,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [source.person()],
})
