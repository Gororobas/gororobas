import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

export const FilmDirectorsProperty = defineProperty({
  id: "filmDirectors",
  value: ArticleOrName,
  subjectKinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "LIST",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "ARTICLE_TEXT_INFERENCE"],
  references: {
    kinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"],
    target: articleOf,
  },
})
