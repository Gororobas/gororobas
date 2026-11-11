import { Result } from "effect"

import { WikidataId } from "../../common/external-identifiers.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"

/**
 * Identifiers drive every fetch, so no machine guesses them: people pick a record in the form's
 * Wikidata search, and the gazetteer's concordances are trusted. Every kind can have one: Silent
 * Spring is Q591623, Ana Primavesi Q10265006. TMDB's concordance for films shows for people to
 * endorse, but doesn't request a Wikidata fetch: only people's IDs do (`providerInputs`).
 */
export const WikidataIdProperty = defineProperty({
  id: "wikidataId",
  valueSchema: WikidataId,
  kinds: everyKind,
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [
    source.person(),
    source.whosOnFirst({
      extract: (place) => (place.wikidataId === null ? [] : [source.found(place.wikidataId)]),
    }),
    source.tmdb({ extract: (work) => Tmdb.wikidataId(work).map(Result.flatMap(source.found)) }),
  ],
  schemaOrg: {
    match: "EXACT",
    encode: (id) => ({ sameAs: `https://www.wikidata.org/wiki/${id}` }),
  },
})
