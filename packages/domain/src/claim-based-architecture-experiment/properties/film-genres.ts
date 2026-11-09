import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** Free text today; "documentary" or "agroforestry" read better as CONCEPT articles. */
export const FilmGenresProperty = defineProperty({
  id: "filmGenres",
  value: ArticleOrName,
  subjectKinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
  references: { kinds: ["CONCEPT"], target: articleOf },
})
