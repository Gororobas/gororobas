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
import { AppButton } from "../../../ui/app-button"
import { EmptyState } from "../../../ui/empty-state"
import * as Icons from "../../../ui/icons"
import { LoadingState, type LoadingStateConfig } from "../../../ui/loading-state"
import { type MediaAttribution, MediaCredit } from "../../../ui/media-credit"
import type { GalleryPhoto } from "../../../ui/photo-gallery"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { breakpoint, space } from "../../../ui/theme"
import { PhotoCreditsBinding, type ProfileViewBuilder, photoCreditId } from "../composition"
import { Message } from "../message"
import type { Collection, Model } from "../model"
import { ObserveCollectionEnd } from "../mount"

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
    loading: LoadingStateConfig
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

/** A photo with what's needed to credit it, in a popover by its badge or a drawer. */
export type ProfilePhoto = GalleryPhoto & Readonly<{ attribution: MediaAttribution }>

/** Only images are shown as photos; the gallery sizes each by its own dimensions. */
export const galleryPhotos = ({
  media,
  language,
}: Readonly<{
  media: ReadonlyArray<CreditedMediaAssetRow>
  language: SupportedLanguage
}>): ReadonlyArray<ProfilePhoto> =>
  media.flatMap((asset): ReadonlyArray<ProfilePhoto> =>
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
            attribution: MediaCredit.uploadedMediaAttribution(asset),
          },
        ]
      : [],
  )

/** Who took a photo and its license, behind a badge over its corner. */
export const photoCredit = (
  { model, photo, i18n }: Readonly<{ model: Model; photo: ProfilePhoto; i18n: Translator }>,
  h: ProfileViewBuilder,
): ReadonlyArray<Html> =>
  MediaCredit.hasCredits(photo.attribution)
    ? EffectArray.fromOption(
        Option.map(
          EffectArray.findFirst(
            model.photoCredits,
            (credit) => credit.id === photoCreditId(photo.key),
          ),
          (instance) =>
            MediaCredit.corner(
              {
                badge: h.block(
                  PhotoCreditsBinding.embedView({
                    key: instance.id,
                    slotId: instance.id,
                    model: instance,
                    viewInputs: MediaCredit.popoverDrawerInputs(
                      { attribution: photo.attribution, i18n },
                      h,
                    ),
                  }),
                ),
              },
              h,
            ),
        ),
      )
    : []

type Paged<Item> = Readonly<{ items: ReadonlyArray<Item>; hasMore: boolean }>

export const isEmptyData = <Item>(
  asyncData: AsyncData.AsyncData<Paged<Item>, ClientFailure>,
): boolean =>
  Option.exists(AsyncData.getData(asyncData), (data) =>
    EffectArray.isReadonlyArrayEmpty(data.items),
  )

const moreStyle = Style.make({ display: "grid", justifyItems: "center", paddingBlock: space[4] })

/**
 * A collection loaded a page at a time: what's loaded, then a marker that loads the next page as
 * the reader nears it, or a way to retry when it failed.
 */
export const pagedView = <Item>(
  {
    collection,
    asyncData,
    loading,
    onItems,
    i18n,
  }: Readonly<{
    collection: Collection
    i18n: Translator
    asyncData: AsyncData.AsyncData<Paged<Item>, ClientFailure>
    loading: LoadingStateConfig
    onItems: (items: ReadonlyArray<Item>) => Html
  }>,
  h: ProfileViewBuilder,
): Html =>
  asyncView(
    {
      i18n,
      asyncData,
      loading,
      onData: (data) =>
        h.div(
          [],
          [
            onItems(data.items),
            ...(data.hasMore
              ? [
                  AsyncData.isStale(asyncData)
                    ? h.div(styledAttributes([], moreStyle), [
                        AppButton.view(
                          {
                            mode: "outline",
                            size: "sm",
                            onClick: Message.ReachedCollectionEnd({ collection }),
                            children: [i18n._(msg`Couldn't load more. Try again`)],
                          },
                          h,
                        ),
                      ])
                    : h.keyed("div")(
                        `${collection}-end`,
                        styledAttributes(
                          [h.OnMount(ObserveCollectionEnd({ collection }))],
                          moreStyle,
                        ),
                        AsyncData.isRefreshing(asyncData) ? [LoadingState.view(loading, h)] : [],
                      ),
                ]
              : []),
          ],
        ),
    },
    h,
  )
