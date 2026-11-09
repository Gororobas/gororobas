import { GoogleBooksVolumeId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

export const GoogleBooksVolumeIdProperty = defineProperty({
  id: "googleBooksVolumeId",
  valueSchema: GoogleBooksVolumeId,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
