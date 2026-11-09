import { AgroforestryStratum } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const StrataProperty = defineProperty({
  id: "strata",
  value: AgroforestryStratum,
  subjectKinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["SYNTROPEDIA", "PERSON"],
})
