import { Schema } from "effect"

import { isValidIsbn } from "../../common/book-identifiers.js"
import { defineProperty } from "../property.js"

const Isbn = Schema.String.check(
  Schema.makeFilter(isValidIsbn, {
    identifier: "Isbn",
    title: "ISBN",
    description: "An ISBN-10 or ISBN-13 with a valid check digit.",
  }),
).pipe(Schema.brand("Isbn"))

/** Today's `isbn10` and `isbn13`: one property, since a book's editions have many of both. */
export const IsbnProperty = defineProperty({
  id: "isbn",
  value: Isbn,
  subjectKinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "GOOGLE_BOOKS"],
  extract: {
    GOOGLE_BOOKS: (result) =>
      result.editions
        .flatMap((edition) => edition.isbn)
        .filter(Schema.is(Isbn))
        .map((value) => ({ value })),
  },
})
