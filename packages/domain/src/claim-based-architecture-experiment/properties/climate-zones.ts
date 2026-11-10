import { ClimateZone } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/** Syntropedia's "bioma de ocorrência", which names climates rather than biomes. */
export const ClimateZonesProperty = defineProperty({
  id: "climateZones",
  valueSchema: ClimateZone,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.person(),
    source.syntropedia({ extract: (plant) => plant.climateZones.map(source.found) }),
  ],
})
