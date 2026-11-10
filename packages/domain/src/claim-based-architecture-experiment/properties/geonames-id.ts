import { GeoNamesId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

export const GeonamesIdProperty = defineProperty({
  id: "geonamesId",
  valueSchema: GeoNamesId,
  kinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person(), source.whosOnFirst()],
  schemaOrg: { match: "EXACT", encode: (id) => ({ sameAs: `https://www.geonames.org/${id}` }) },
})
