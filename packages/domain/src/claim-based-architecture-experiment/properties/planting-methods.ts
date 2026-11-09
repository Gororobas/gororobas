import { PlantingMethod } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const PlantingMethodsProperty = defineProperty({
  id: "plantingMethods",
  value: PlantingMethod,
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
