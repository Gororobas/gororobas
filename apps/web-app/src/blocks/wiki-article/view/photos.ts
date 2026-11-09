import { Array as EffectArray, Option } from "effect"

import { mediaCaption } from "../../../lib/media-caption"
import { imageUrl } from "../../../media-urls"
import { type MediaAttribution, MediaCredit, type MediaDimensions } from "../../../ui/media-credit"
import type { Page } from "./shared"

type PhotoWidth = 300 | 1280

/** A photo of what the article is about, whether people uploaded it here or a provider had it. */
export type ArticlePhoto = Readonly<{
  key: string
  /** Its credit's popover and drawer, unique on the page. */
  creditId: string
  src: (width: PhotoWidth) => string
  maybeCaption: Option.Option<string>
  maybeCategory: Option.Option<string>
  attribution: MediaAttribution
  /** As displayed, so its space is reserved before it loads. */
  maybeDimensions: Option.Option<MediaDimensions>
}>

export const photoCreditId = (index: number) => `wiki-article-photo-credit-${index}`

/**
 * The article's own photos first, then providers', so a provider's first photo stands in as the
 * main one while the article has none.
 */
export const articlePhotos = (page: Page): ReadonlyArray<ArticlePhoto> =>
  [
    ...page.mediaAssets.map((media) => ({ media, maybeSourceUrl: Option.none<string>() })),
    ...page.externalData.media.map(({ mediaAsset, sourceUrl }) => ({
      media: mediaAsset,
      maybeSourceUrl: Option.some(sourceUrl),
    })),
  ]
    .flatMap(({ media, maybeSourceUrl }): ReadonlyArray<Omit<ArticlePhoto, "creditId">> =>
      media.format === "IMAGE"
        ? [
            {
              key: media.id,
              src: (width) => imageUrl(media.id, width),
              // Captions read in the language the article itself was served in.
              maybeCaption: mediaCaption({ media, language: page.language }),
              maybeCategory: Option.fromNullishOr(media.category),
              attribution: MediaCredit.mediaAssetAttribution(media, maybeSourceUrl),
              maybeDimensions: Option.some({
                width: media.metadata.originalWidth,
                height: media.metadata.originalHeight,
              }),
            },
          ]
        : [],
    )
    .map((photo, index) => ({ ...photo, creditId: photoCreditId(index) }))

export const mainPhoto = (page: Page): Option.Option<ArticlePhoto> =>
  EffectArray.head(articlePhotos(page))
