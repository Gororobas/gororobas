import type { MediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { tiptapToText } from "@gororobas/domain/rich-text/tiptap-to-text"
import { Array as EffectArray, Option, String as EffectString } from "effect"

import { externalImageUrl, imageUrl } from "../../../media-urls"
import type { MediaCreditEntry } from "../../../ui/media-credit"
import type { Page } from "./shared"

type PhotoWidth = 300 | 1280

/** A photo of what the article is about, whether people uploaded it here or a provider has it. */
export type ArticlePhoto = Readonly<{
  key: string
  src: (width: PhotoWidth) => string
  maybeCaption: Option.Option<string>
  maybeCategory: Option.Option<string>
  credits: ReadonlyArray<MediaCreditEntry>
  maybeLicenseUrl: Option.Option<string>
}>

/** The pt description of a photo, as plain text. */
const caption = (media: MediaAssetRow): Option.Option<string> =>
  Option.fromNullishOr(media.descriptions.pt).pipe(
    Option.map((document) => EffectString.trim(tiptapToText(document))),
    Option.filter(EffectString.isNonEmpty),
  )

/**
 * The article's own photos first, then providers', so a provider's first photo stands in as the
 * main one while the article has none.
 */
export const articlePhotos = (page: Page): ReadonlyArray<ArticlePhoto> => [
  ...page.mediaAssets.flatMap((media): ReadonlyArray<ArticlePhoto> =>
    media.format === "IMAGE"
      ? [
          {
            key: media.id,
            src: (width) => imageUrl(media.id, width),
            maybeCaption: caption(media),
            maybeCategory: Option.fromNullishOr(media.category),
            credits: media.credits.map((credit) => ({
              maybeProfile: Option.fromNullishOr(credit.profile),
              maybeLine: Option.fromNullishOr(credit.creditLine),
              maybeUrl: Option.fromNullishOr(credit.creditUrl),
            })),
            maybeLicenseUrl: Option.none(),
          },
        ]
      : [],
  ),
  ...page.externalData.media.map((media): ArticlePhoto => ({
    key: media.mediaUrl,
    src: (width) => externalImageUrl(media.mediaUrl, width),
    maybeCaption: Option.none(),
    maybeCategory: Option.none(),
    credits: [
      {
        maybeProfile: Option.none(),
        maybeLine: Option.some(media.creditLine),
        maybeUrl: Option.some(media.sourceUrl),
      },
    ],
    maybeLicenseUrl: Option.fromNullishOr(media.licenseUrl),
  })),
]

export const mainPhoto = (page: Page): Option.Option<ArticlePhoto> =>
  EffectArray.head(articlePhotos(page))
