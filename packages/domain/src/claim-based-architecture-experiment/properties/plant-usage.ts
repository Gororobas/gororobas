import { PlantUsage } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const PlantUsageProperty = defineProperty({
  id: "plantUsage",
  value: PlantUsage,
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
