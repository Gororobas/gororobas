import { Array as EffectArray, Option } from "effect"

import { MediaAssetId } from "../../common/ids.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"

/**
 * Today's `wiki_article_main_media`, and the rule that a provider's first photo stands in while
 * the article has none: that rule is now just source order.
 */
export const MainImageProperty = defineProperty({
  id: "mainImage",
  value: MediaAssetId,
  subjectKinds: everyKind,
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "GBIF"],
  extract: {
    GBIF: (result) =>
      Option.toArray(EffectArray.head(result.photos)).map(({ mediaAssetId }) => ({
        value: mediaAssetId,
      })),
  },
})
