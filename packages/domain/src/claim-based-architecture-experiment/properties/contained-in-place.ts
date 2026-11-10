import { Option, Result } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineProperty } from "../property.js"
import { WhosOnFirst } from "../providers/whos-on-first.js"

/**
 * Today's `parentPlaceId`, allowing several parents: a watershed across two states, a
 * municipality inside a state and a biome.
 */
export const ContainedInPlaceProperty = defineProperty({
  id: "containedInPlace",
  valueSchema: WikiArticleId,
  kinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.whosOnFirst({
      // Only the closest: a municipality is in its state, which is in its country.
      extract: (place, context) =>
        place.ancestorIds
          .slice(0, 1)
          .map((ancestorId) =>
            Result.flatMap(WhosOnFirst.article(ancestorId, context), source.found),
          ),
    }),
    source.person(),
  ],
  references: { targetKinds: ["PLACE"], target: Option.some },
  schemaOrg: {
    match: "EXACT",
    encode: (place, { context }) => ({ containedInPlace: { "@id": context.articleUrl(place) } }),
  },
})
