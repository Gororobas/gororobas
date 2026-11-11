import { Result } from "effect"

import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"
import { ArticleOrName, articleOf, articleOrNameToJsonLd } from "../values/article-or-name.js"

/**
 * Who acts in a work, in billing order: a role property like `directors`. TMDB names the top
 * billed (`Tmdb.cast`), as names until people link them to articles.
 */
export const ActorsProperty = defineProperty({
  id: "actors",
  valueSchema: ArticleOrName,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "LIST",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.tmdb({
      extract: (work) =>
        Tmdb.cast(work).map((name) => Result.flatMap(Tmdb.name(name), source.found)),
    }),
  ],
  references: { targetKinds: ["NOTEWORTHY_PERSON"], target: articleOf },
  schemaOrg: {
    match: "EXACT",
    encode: (actor, { context }) => ({ actor: articleOrNameToJsonLd(actor, context) }),
  },
})
