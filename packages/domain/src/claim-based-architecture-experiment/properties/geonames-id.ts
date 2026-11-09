import { GeoNamesId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

export const GeonamesIdProperty = defineProperty({
  id: "geonamesId",
  valueSchema: GeoNamesId,
  kinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "WHOS_ON_FIRST"],
})
