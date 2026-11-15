import { Array as EffectArray, Option } from "effect"

import { MediaAssetId } from "../../common/ids.js"
import { everyKind } from "../kinds.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * A provider's first photo stands in while the article has none: that is just source order.
 */
export const MainImageProperty = defineCanonicalProperty({
  id: "mainImage",
  valueSchema: MediaAssetId,
  kinds: everyKind,
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.gbif({
      extract: (result) =>
        Option.toArray(EffectArray.head(result.photos)).map(({ mediaAssetId }) =>
          source.found(mediaAssetId),
        ),
    }),
    source.contentChannels({
      extract: (item) =>
        Option.toArray(Option.fromNullishOr(item.thumbnail)).map(({ mediaAssetId }) =>
          source.found(mediaAssetId),
        ),
    }),
  ],
})
