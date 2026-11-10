import { AgroforestryRole } from "../../common/enums.js"
import { defineProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"

/**
 * Syntropedia records roles per site a plant was tested in; here they're the plant's. Sites
 * themselves could become `growsIn` claims (see the implementation plan).
 */
export const AgroforestryRolesProperty = defineProperty({
  id: "agroforestryRoles",
  valueSchema: AgroforestryRole,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) => Syntropedia.agroforestryRoles(plant).map(source.found),
    }),
  ],
})
