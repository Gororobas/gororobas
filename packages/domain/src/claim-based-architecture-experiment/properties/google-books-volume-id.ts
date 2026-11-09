import { GoogleBooksVolumeId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

export const GoogleBooksVolumeIdProperty = defineProperty({
  id: "googleBooksVolumeId",
  value: GoogleBooksVolumeId,
  subjectKinds: ["BOOK"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
