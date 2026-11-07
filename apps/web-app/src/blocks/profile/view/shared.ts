import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { CreditedMediaAssetRow } from "@gororobas/domain/media-assets/domain"
import type { ProfilePageData } from "@gororobas/domain/profiles/domain"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Array as EffectArray, type DateTime, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import type { ClientFailure } from "../../../lib/client-failure"
import { mediaCaption } from "../../../lib/media-caption"
import type { Translator } from "../../../lib/translations"
import { imageUrl } from "../../../media-urls"
import { EmptyState } from "../../../ui/empty-state"
import * as Icons from "../../../ui/icons"
import { type LoadingShape, LoadingState } from "../../../ui/loading-state"
import type { GalleryPhoto } from "../../../ui/photo-gallery"
import { breakpoint, space } from "../../../ui/theme"
import type { ProfileViewBuilder } from "../composition"
import type { Model } from "../model"

export type Page = ProfilePageData

/** The inputs every profile section renders from. */
export type ProfileState = Readonly<{
  model: Model
  language: SupportedLanguage
  page: Page
  /** Dates read relative to it; without it, cards show the full date. */
  maybeToday: Option.Option<DateTime.Utc>
}>

export const sectionsStyle = Style.make({
  display: "grid",
  rowGap: space[5],
  paddingBlock: space[5],
}).pipe(Style.when(breakpoint.md, { rowGap: space[6], paddingBlock: space[8] }))

export const listStyle = Style.make({ display: "grid", rowGap: space[3] })

export const cardGridStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(18rem, 100%), 1fr))",
  gap: space[3],
})

export const asyncView = <A>(
  {
    asyncData,
    loading,
    onData,
    i18n,
  }: Readonly<{
    i18n: Translator
    asyncData: AsyncData.AsyncData<A, ClientFailure>
    loading: Readonly<{ label: string; shape: LoadingShape; count?: number }>
    onData: (data: A) => Html
  }>,
  h: ProfileViewBuilder,
): Html =>
  AsyncData.matchData(asyncData, {
    onEmpty: () => LoadingState.view(loading, h),
    onFailure: () =>
      EmptyState.view(
        {
          icon: Icons.alertCircle,
          title: i18n._(msg`Couldn't load right now`),
          maybeDescription: Option.some(i18n._(msg`Try reloading the page in a moment.`)),
        },
        h,
      ),
    onData,
  })

/** Only images are shown as photos; the gallery sizes each by its own dimensions. */
export const galleryPhotos = ({
  media,
  language,
}: Readonly<{
  media: ReadonlyArray<CreditedMediaAssetRow>
  language: SupportedLanguage
}>): ReadonlyArray<GalleryPhoto> =>
  media.flatMap((asset): ReadonlyArray<GalleryPhoto> =>
    asset.format === "IMAGE"
      ? [
          {
            key: asset.id,
            src: (width) => imageUrl(asset.id, width),
            maybeCaption: mediaCaption({ media: asset, language }),
            maybeDimensions: Option.some({
              width: asset.metadata.originalWidth,
              height: asset.metadata.originalHeight,
            }),
          },
        ]
      : [],
  )

export const isEmptyData = <A>(
  asyncData: AsyncData.AsyncData<ReadonlyArray<A>, ClientFailure>,
): boolean => Option.exists(AsyncData.getData(asyncData), EffectArray.isReadonlyArrayEmpty)
