import { PlantingMethod } from "../../common/enums.js"
import { defineProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"

export const PlantingMethodsProperty = defineProperty({
  id: "plantingMethods",
  valueSchema: PlantingMethod,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) => Syntropedia.plantingMethods(plant).map(source.found),
    }),
  ],
})
