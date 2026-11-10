import { BookEdition } from "../../wiki/external-data/kinds/book-external-data.js"
import { defineProperty } from "../property.js"

/** Today's `wiki_book_editions`, as Google Books lists them. */
export const BookEditionsProperty = defineProperty({
  id: "bookEditions",
  valueSchema: BookEdition,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.googleBooks({ extract: (result) => result.editions.map(source.found) }),
  ],
})
