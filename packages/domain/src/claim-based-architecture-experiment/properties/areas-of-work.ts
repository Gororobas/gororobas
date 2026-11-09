import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** Free text today; agroecology's themes are CONCEPT articles. */
export const AreasOfWorkProperty = defineProperty({
  id: "areasOfWork",
  value: ArticleOrName,
  subjectKinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "ARTICLE_TEXT_INFERENCE"],
  references: { kinds: ["CONCEPT"], target: articleOf },
})
