import { Option } from "effect"

import { PositiveInteger } from "../../common/primitives.js"
import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"

/**
 * How long a film runs, in minutes. Series don't have one: their episodes' lengths vary, and
 * TMDB's per-episode runtimes are too loose to assert.
 * @todo rename to duration and apply it to resources (useful for YouTube videos and Podcasts)
 */
export const RuntimeProperty = defineProperty({
  id: "runtime",
  // @todo make it a Duration encoded as an integer of minutes
  valueSchema: PositiveInteger,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.tmdb({ extract: (work) => Option.toArray(Tmdb.runtime(work)).map(source.found) }),
  ],
  // ISO 8601 durations, which schema.org uses, have no minutes-only form: PT136M is valid.
  schemaOrg: { match: "EXACT", encode: (minutes) => ({ duration: `PT${minutes}M` }) },
})
