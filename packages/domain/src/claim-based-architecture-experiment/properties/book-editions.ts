import { BookEdition } from "../../wiki/external-data/kinds/book-external-data.js"
import { defineCanonicalProperty } from "../property.js"

/** Editions as Google Books lists them. */
export const BookEditionsProperty = defineCanonicalProperty({
  id: "bookEditions",
  valueSchema: BookEdition,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [
    source.googleBooks({ extract: (result) => result.editions.map(source.found) }),
  ],
})
