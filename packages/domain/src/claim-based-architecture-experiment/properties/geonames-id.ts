import { GeoNamesId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

export const GeonamesIdProperty = defineProperty({
  id: "geonamesId",
  value: GeoNamesId,
  subjectKinds: ["PLACE"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "WHOS_ON_FIRST"],
})
