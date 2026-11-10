import { Option } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineProperty } from "../property.js"

/**
 * Today's `parentPlaceId`, allowing several parents: a watershed across two states, a
 * municipality inside a state and a biome.
 */
export const ContainedByPlaceProperty = defineProperty({
  id: "containedByPlace",
  valueSchema: WikiArticleId,
  kinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [source.whosOnFirst(), source.person()],
  references: { targetKinds: ["PLACE"], target: Option.some },
  schemaOrg: {
    match: "EXACT",
    encode: (place, { context }) => ({ containedInPlace: { "@id": context.articleUrl(place) } }),
  },
})
