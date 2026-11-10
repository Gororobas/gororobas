import { Schema } from "effect"

import { isbnDigits, isValidIsbn } from "../../common/book-identifiers.js"
import { defineProperty } from "../property.js"

const Isbn = Schema.String.check(
  Schema.makeFilter(isValidIsbn, {
    identifier: "Isbn",
    title: "ISBN",
    description: "An ISBN-10 or ISBN-13 with a valid check digit.",
  }),
).pipe(
  Schema.brand("Isbn"),
  // "978-85-7326-123-4" and "9788573261234" are one ISBN.
  Schema.overrideToEquivalence(() => (self, that) => isbnDigits(self) === isbnDigits(that)),
)

/** Today's `isbn10` and `isbn13`: one property, since a book's editions have many of both. */
export const IsbnProperty = defineProperty({
  id: "isbn",
  valueSchema: Isbn,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.person(),
    source.googleBooks({
      extract: (result) =>
        result.editions
          .flatMap((edition) => edition.isbn)
          .filter(Schema.is(Isbn))
          .map(source.found),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: (isbn) => ({ isbn }) },
})
