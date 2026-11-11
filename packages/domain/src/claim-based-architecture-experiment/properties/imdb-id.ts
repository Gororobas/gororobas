import { Result } from "effect"

import { ImdbTitleId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"

/** TMDB's concordance with IMDb, which most people know their films by. */
export const ImdbIdProperty = defineProperty({
  id: "imdbId",
  valueSchema: ImdbTitleId,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.tmdb({ extract: (work) => Tmdb.imdbId(work).map(Result.flatMap(source.found)) }),
  ],
  schemaOrg: {
    match: "EXACT",
    encode: (id) => ({ sameAs: `https://www.imdb.com/title/${id}` }),
  },
})
