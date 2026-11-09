import { PlaceKind } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const PlaceKindProperty = defineProperty({
  id: "placeKind",
  value: PlaceKind,
  subjectKinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["WHOS_ON_FIRST", "PERSON"],
})
