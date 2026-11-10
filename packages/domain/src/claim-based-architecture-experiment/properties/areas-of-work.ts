import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** Free text today; agroecology's themes are CONCEPT articles. */
export const AreasOfWorkProperty = defineProperty({
  id: "areasOfWork",
  valueSchema: ArticleOrName,
  kinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [source.person(), source.articleTextInference()],
  references: { targetKinds: ["CONCEPT"], target: articleOf },
})
