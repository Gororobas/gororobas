import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"
import { articleOrNameToJsonLd } from "../values/article-or-name.js"

/** Free text today; "documentary" or "agroforestry" read better as CONCEPT articles. */
export const GenresProperty = defineProperty({
  id: "genres",
  valueSchema: ArticleOrName,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [source.person()],
  references: { targetKinds: ["CONCEPT"], target: articleOf },
  schemaOrg: {
    match: "EXACT",
    encode: (genre, { context }) => ({ genre: articleOrNameToJsonLd(genre, context) }),
  },
})
