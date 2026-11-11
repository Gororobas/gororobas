import { Result } from "effect"

import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"
import { ArticleOrName, articleOf, articleOrNameToJsonLd } from "../values/article-or-name.js"

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
  sources: (source) => [
    source.tmdb({
      extract: (work) =>
        Tmdb.directors(work).map((name) => Result.flatMap(Tmdb.name(name), source.found)),
    }),
    source.person(),
    source.articleTextInference(),
  ],
  references: {
    targetKinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"],
    target: articleOf,
  },
  schemaOrg: {
    match: "EXACT",
    encode: (director, { context }) => ({ director: articleOrNameToJsonLd(director, context) }),
  },
})
