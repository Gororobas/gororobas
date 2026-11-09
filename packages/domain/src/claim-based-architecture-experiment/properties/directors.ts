import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/**
 * Who directed a film: Wikidata's P57, schema.org's `director`. A role property, like `authors`.
 */
export const DirectorsProperty = defineProperty({
  id: "directors",
  valueSchema: ArticleOrName,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "LIST",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "ARTICLE_TEXT_INFERENCE"],
  references: {
    targetKinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"],
    target: articleOf,
  },
})
