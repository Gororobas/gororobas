import { Result } from "effect"

import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"
import { ArticleOrName, articleOf, articleOrNameToJsonLd } from "../values/article-or-name.js"

/** Today's film `country`, free text. */
export const CountryOfOriginProperty = defineProperty({
  id: "countryOfOrigin",
  valueSchema: ArticleOrName,
  kinds: ["FILM"],
  // @TODO countryOfOrigin must be language-specific due to its translations
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    // Named in Portuguese until TMDB's ISO codes can match our PLACE articles.
    source.tmdb({
      extract: (work) =>
        Tmdb.productionCountries(work).map((name) => Result.flatMap(Tmdb.name(name), source.found)),
    }),
    source.person(),
  ],
  references: { targetKinds: ["PLACE"], target: articleOf },
  schemaOrg: {
    match: "EXACT",
    encode: (country, { context }) => ({
      countryOfOrigin: articleOrNameToJsonLd(country, context),
    }),
  },
})
