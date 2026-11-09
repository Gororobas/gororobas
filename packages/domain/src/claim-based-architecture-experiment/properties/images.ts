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
  sources: ["PERSON", "GBIF", "CONTENT_CHANNELS"],
  extract: {
    GBIF: (result) => result.photos.map(({ mediaAssetId }) => ({ value: mediaAssetId })),
    CONTENT_CHANNELS: (item) =>
      Option.toArray(Option.fromNullishOr(item.thumbnail)).map(({ mediaAssetId }) => ({
        value: mediaAssetId,
      })),
  },
})
