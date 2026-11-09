import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** In credit order, which people set: a book's first author is a fact about it. */
export const BookAuthorsProperty = defineProperty({
  id: "bookAuthors",
  value: ArticleOrName,
  subjectKinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "LIST",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "ARTICLE_TEXT_INFERENCE"],
  references: {
    kinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"],
    target: articleOf,
  },
})
