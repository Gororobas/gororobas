import { defineProperty } from "../property.js"
import { Credit, articleOf, sameCredit } from "../values/article-or-name.js"

export const FilmDirectorsProperty = defineProperty({
  id: "filmDirectors",
  value: Credit,
  subjectKinds: ["FILM"],
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
