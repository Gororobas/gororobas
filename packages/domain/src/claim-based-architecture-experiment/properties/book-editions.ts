import { BookEdition } from "../../wiki/external-data/kinds/book-external-data.js"
import { defineProperty } from "../property.js"

/** Today's `wiki_book_editions`, as Google Books lists them. */
export const BookEditionsProperty = defineProperty({
  id: "bookEditions",
  value: BookEdition,
  subjectKinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["GOOGLE_BOOKS"],
  sameValue: (self, that) => self.externalId === that.externalId,
  extract: {
    GOOGLE_BOOKS: (result) => result.editions.map((value) => ({ value })),
  },
})
