import { EdiblePlantPart } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const EdiblePartsProperty = defineProperty({
  id: "edibleParts",
  value: EdiblePlantPart,
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "ARTICLE_WIDE",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
