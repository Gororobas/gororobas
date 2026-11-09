import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

export const PublisherProperty = defineProperty({
  id: "publisher",
  value: ArticleOrName,
  subjectKinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "TEXT_INFERENCE"],
  references: { kinds: ["NOTEWORTHY_ENTITY"], target: articleOf },
})
