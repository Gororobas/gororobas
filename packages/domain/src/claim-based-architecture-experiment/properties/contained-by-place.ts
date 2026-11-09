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
  sources: ["WHOS_ON_FIRST", "PERSON"],
  references: { targetKinds: ["PLACE"], target: Option.some },
})
