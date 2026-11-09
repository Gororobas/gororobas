import { defineProperty } from "../property.js"
import { Credit, articleOf, sameCredit } from "../values/article-or-name.js"

/** Ordered by `position`, which is part of the value: order is a fact about the book. */
export const BookAuthorsProperty = defineProperty({
  id: "bookAuthors",
  value: Credit,
  subjectKinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "TEXT_INFERENCE"],
  references: {
    kinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"],
    target: ({ credited }) => articleOf(credited),
  },
  sameValue: sameCredit,
})
