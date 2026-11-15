import { defineCanonicalProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** Free text today; agroecology's themes are CONCEPT articles. */
export const AreasOfWorkProperty = defineCanonicalProperty({
  id: "areasOfWork",
  valueSchema: ArticleOrName,
  kinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
  references: { targetKinds: ["CONCEPT"], target: articleOf },
})
