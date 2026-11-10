import { GoogleBooksVolumeId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

export const GoogleBooksVolumeIdProperty = defineProperty({
  id: "googleBooksVolumeId",
  valueSchema: GoogleBooksVolumeId,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
  schemaOrg: {
    match: "EXACT",
    encode: (id) => ({ sameAs: `https://books.google.com/books?id=${id}` }),
  },
})
