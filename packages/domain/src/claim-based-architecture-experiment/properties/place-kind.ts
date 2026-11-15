import { PlaceKind } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

export const PlaceKindProperty = defineCanonicalProperty({
  id: "placeKind",
  valueSchema: PlaceKind,
  kinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [
    source.whosOnFirst({ extract: (place) => [source.found(place.placeKind)] }),
    source.person(),
  ],
})
