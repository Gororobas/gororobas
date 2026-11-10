import { Option } from "effect"

import { MediaAssetId } from "../../common/ids.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"

/**
 * Today's `wiki_article_media_assets` and `wiki_article_external_media`. Every image is a media
 * asset, providers' photos included (see `ImportedPhoto`), and keeps its own moderation
 * lifecycle as an asset; this claim only says it depicts the article. Per-article categories and
 * descriptions (today on revision media) would become fields of the value.
 */
export const ImagesProperty = defineProperty({
  id: "images",
  valueSchema: MediaAssetId,
  kinds: everyKind,
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.person(),
    source.gbif({
      extract: (result) => result.photos.map(({ mediaAssetId }) => source.found(mediaAssetId)),
    }),
    source.contentChannels({
      extract: (item) =>
        Option.toArray(Option.fromNullishOr(item.thumbnail)).map(({ mediaAssetId }) =>
          source.found(mediaAssetId),
        ),
    }),
  ],
  schemaOrg: {
    match: "EXACT",
    encode: (mediaAssetId, { context }) => ({ image: context.mediaUrl(mediaAssetId) }),
  },
})
