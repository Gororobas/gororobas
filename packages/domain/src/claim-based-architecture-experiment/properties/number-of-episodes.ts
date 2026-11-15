import { Option } from "effect"

import { PositiveInteger } from "../../common/primitives.js"
import { defineCanonicalProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"

/** Series only. */
export const NumberOfEpisodesProperty = defineCanonicalProperty({
  id: "numberOfEpisodes",
  valueSchema: PositiveInteger,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.tmdb({
      extract: (work) => Option.toArray(Tmdb.numberOfEpisodes(work)).map(source.found),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: (episodes) => ({ numberOfEpisodes: episodes }) },
})
