import { Array as EffectArray, Option } from "effect"

import { mediaCaption } from "../../../lib/media-caption"
import { externalImageUrl, imageUrl } from "../../../media-urls"
import type { MediaAttribution, MediaDimensions } from "../../../ui/media-credit"
import type { Page } from "./shared"

type PhotoWidth = 300 | 1280

/** A photo of what the article is about, whether people uploaded it here or a provider has it. */
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
    ...page.mediaAssets.flatMap((media): ReadonlyArray<Omit<ArticlePhoto, "creditId">> =>
      media.format === "IMAGE"
        ? [
            {
              key: media.id,
              src: (width) => imageUrl(media.id, width),
              // Captions read in the language the article itself was served in.
              maybeCaption: mediaCaption({ media, language: page.language }),
              maybeCategory: Option.fromNullishOr(media.category),
              attribution: {
                credits: media.credits.map((credit) => ({
                  maybeProfile: Option.fromNullishOr(credit.profile),
                  maybeLine: Option.fromNullishOr(credit.creditLine),
                  maybeUrl: Option.fromNullishOr(credit.creditUrl),
                })),
                maybeLicenseUrl: Option.none(),
                maybeSourceUrl: Option.none(),
              },
              maybeDimensions: Option.some({
                width: media.metadata.originalWidth,
                height: media.metadata.originalHeight,
              }),
            },
          ]
        : [],
    ),
    ...page.externalData.media.map((media): Omit<ArticlePhoto, "creditId"> => ({
      key: media.mediaUrl,
      src: (width) => externalImageUrl(media.mediaUrl, width),
      maybeCaption: Option.none(),
      maybeCategory: Option.none(),
      attribution: {
        credits: [
          {
            maybeProfile: Option.none(),
            maybeLine: Option.some(media.creditLine),
            maybeUrl: Option.none(),
          },
        ],
        maybeLicenseUrl: Option.fromNullishOr(media.licenseUrl),
        maybeSourceUrl: Option.some(media.sourceUrl),
      },
      maybeDimensions:
        media.width === null || media.height === null
          ? Option.none()
          : Option.some({ width: media.width, height: media.height }),
    })),
  ].map((photo, index) => ({ ...photo, creditId: photoCreditId(index) }))

export const mainPhoto = (page: Page): Option.Option<ArticlePhoto> =>
  EffectArray.head(articlePhotos(page))
