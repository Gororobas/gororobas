import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

export const PublisherProperty = defineProperty({
  id: "publisher",
  valueSchema: ArticleOrName,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "ARTICLE_TEXT_INFERENCE"],
  references: { targetKinds: ["NOTEWORTHY_ENTITY"], target: articleOf },
})
