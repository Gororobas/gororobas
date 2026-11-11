import { defineProperty } from "../property.js"
import { TmdbWorkId, tmdbUrl } from "../providers/tmdb.js"

/**
 * Identifiers drive every fetch, so no machine guesses them: people match a work to TMDB's in the
 * form's search (`Tmdb.search`), and their choice is the claim. A movie and a series can share
 * a number, so the value carries its media type.
 */
export const TmdbIdProperty = defineProperty({
  id: "tmdbId",
  valueSchema: TmdbWorkId,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [source.person()],
  schemaOrg: { match: "EXACT", encode: (work) => ({ sameAs: tmdbUrl(work) }) },
})
