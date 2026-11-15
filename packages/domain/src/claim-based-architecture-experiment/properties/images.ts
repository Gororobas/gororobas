import { Option } from "effect"

import { MediaAssetId } from "../../common/ids.js"
import { everyKind } from "../kinds.js"
import { defineSituatedProperty } from "../property.js"

/**
 * Every image is a media asset, providers' photos included (see `ImportedPhoto`), and keeps its own moderation
 * lifecycle as an asset; this claim only says it depicts the article. Per-article categories and
 * descriptions would become fields of the value.
 */
export const ImagesProperty = defineSituatedProperty({
  id: "images",
  valueSchema: MediaAssetId,
  kinds: everyKind,
  scope: "UNIVERSAL",
  sources: (source) => ({
    person: source.person({ inferable: false }),
    gbif: source.gbif({
      extract: (result) => result.photos.map(({ mediaAssetId }) => source.found(mediaAssetId)),
    }),
    contentChannels: source.contentChannels({
      extract: (item) =>
        Option.toArray(Option.fromNullishOr(item.thumbnail)).map(({ mediaAssetId }) =>
          source.found(mediaAssetId),
        ),
    }),
  }),
  summary: (summarize) => summarize.wholeValues(),
  schemaOrg: {
    match: "EXACT",
    encode: (mediaAssetId, { context }) => ({ image: context.mediaUrl(mediaAssetId) }),
  },
})
