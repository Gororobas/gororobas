import { GeoNamesId } from "../../common/external-identifiers.js"
import { defineCanonicalProperty } from "../property.js"

export const GeonamesIdProperty = defineCanonicalProperty({
  id: "geonamesId",
  valueSchema: GeoNamesId,
  kinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [
    source.person(),
    source.whosOnFirst({
      extract: (place) => (place.geonamesId === null ? [] : [source.found(place.geonamesId)]),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: (id) => ({ sameAs: `https://www.geonames.org/${id}` }) },
})
