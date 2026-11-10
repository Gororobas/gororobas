import { PlantLifecycle } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const LifecyclesProperty = defineProperty({
  id: "lifecycles",
  valueSchema: PlantLifecycle,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [source.person()],
})
