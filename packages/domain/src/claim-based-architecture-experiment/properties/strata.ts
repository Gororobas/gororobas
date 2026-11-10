import { AgroforestryStratum } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/** Syntropedia ranks first: strata are what it specializes in. */
export const StrataProperty = defineProperty({
  id: "strata",
  valueSchema: AgroforestryStratum,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.syntropedia({ extract: (plant) => plant.strata.map(source.found) }),
    source.person(),
  ],
})
