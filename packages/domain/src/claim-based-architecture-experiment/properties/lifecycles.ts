import { PlantLifecycle } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const LifecyclesProperty = defineProperty({
  id: "lifecycles",
  value: PlantLifecycle,
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "ARTICLE_WIDE",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
