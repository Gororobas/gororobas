import { Option } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineProperty } from "../property.js"

/**
 * Today's `parentPlaceId`, allowing several parents: a watershed across two states, a
 * municipality inside a state and a biome.
 */
export const ContainedByPlaceProperty = defineProperty({
  id: "containedByPlace",
  value: WikiArticleId,
  subjectKinds: ["PLACE"],
  scope: "ARTICLE_WIDE",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["WHOS_ON_FIRST", "PERSON"],
  references: { kinds: ["PLACE"], target: Option.some },
})
