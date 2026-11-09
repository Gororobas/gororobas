import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** Today's film `country`, free text. */
export const CountryOfOriginProperty = defineProperty({
  id: "countryOfOrigin",
  value: ArticleOrName,
  subjectKinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
  references: { kinds: ["PLACE"], target: articleOf },
})
