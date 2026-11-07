import { msg } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { profileUrl } from "../../../app/route"
import type { ClientFailure } from "../../../lib/client-failure"
import { type Translator, translatorFor } from "../../../lib/translations"
import { EmptyState } from "../../../ui/empty-state"
import * as Icons from "../../../ui/icons"
import type { IconConfig } from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { PublicationCard } from "../../../ui/publication-card"
import { RichText } from "../../../ui/rich-text"
import { SectionCard, cardBleedStyle } from "../../../ui/section-card"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { breakpoint, fontWeight, radius, space, toneColors, tones } from "../../../ui/theme"
import { WikiArticleRow } from "../../../ui/wiki-article-row"
import type { ProfileViewBuilder } from "../composition"
import { contributionSummary } from "./collections"
import {
  type ProfileState,
  asyncView,
  galleryPhotos,
  isEmptyData,
  listStyle,
  sectionsStyle,
} from "./shared"

const PREVIEW_PUBLICATION_COUNT = 4
const PREVIEW_PHOTO_COUNT = 6
const PREVIEW_BOOKMARK_COUNT = 5
const PREVIEW_CONTRIBUTION_COUNT = 4

/** One column on small screens; wide screens move what the profile follows into a sidebar. */
const layoutStyle = Style.make({
  display: "flex",
  flexDirection: "column",
  rowGap: space[5],
}).pipe(
  Style.when(breakpoint.lg, {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 22rem",
    alignItems: "start",
    columnGap: space[8],
  }),
)

const columnStyle = Style.make({ display: "flex", flexDirection: "column", rowGap: space[5] }).pipe(
  Style.when(breakpoint.lg, { rowGap: space[6] }),
)

const carouselStyle = Style.make({
  display: "flex",
  gap: space[3],
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  paddingBlockEnd: space[1],
})

const carouselItemStyle = Style.make({ flex: "0 0 min(22rem, 88%)", scrollSnapAlign: "start" })

const photoStripStyle = Style.make({ display: "flex", gap: space[3], overflowX: "auto" })

const photoThumbnailStyle = Style.make({
  flex: "0 0 auto",
  blockSize: "7rem",
  objectFit: "cover",
  borderRadius: radius.md,
  backgroundColor: tones.primary.ramp[300],
})

const morePhotosStyle = Style.make({
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  blockSize: "7rem",
  aspectRatio: "1",
  borderRadius: radius.md,
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[700],
  fontWeight: fontWeight.semibold,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const bioStyle = Style.make({ color: toneColors.foreground })

/** A sample of one collection, linking to all of it; hidden once it's known to be empty. */
const sample = <A>(
  {
    title,
    loadingLabel,
    i18n,
    icon,
    asyncData,
    footerLink,
    loadingShape,
    render,
  }: Readonly<{
    title: string
    loadingLabel: string
    i18n: Translator
    icon: (config?: IconConfig) => Html
    asyncData: AsyncData.AsyncData<ReadonlyArray<A>, ClientFailure>
    footerLink: Readonly<{ label: string; href: string }>
    loadingShape: "rows" | "cards" | "tiles"
    render: (items: EffectArray.NonEmptyReadonlyArray<A>) => Html
  }>,
  h: ProfileViewBuilder,
): ReadonlyArray<Html> =>
  isEmptyData(asyncData)
    ? []
    : [
        SectionCard.view(
          {
            title,
            icon,
            footerLink,
            children: [
              asyncView(
                {
                  i18n,
                  asyncData,
                  loading: {
                    label: loadingLabel,
                    shape: loadingShape,
                    count: 2,
                  },
                  onData: (items) =>
                    EffectArray.match(items, { onEmpty: () => h.empty, onNonEmpty: render }),
                },
                h,
              ),
            ],
          },
          h,
        ),
      ]

const bio = ({ page, language }: ProfileState, h: ProfileViewBuilder): ReadonlyArray<Html> =>
  page.bio === null
    ? []
    : [
        SectionCard.view(
          {
            title: translatorFor(language)._(msg({ message: "About", context: "profile bio" })),
            icon: Icons.user,
            children: [
              h.div(styledAttributes([], bioStyle), [
                RichText.view({ document: page.bio, i18n: translatorFor(language) }, h),
              ]),
            ],
          },
          h,
        ),
      ]

const publications = (
  { model, language, page, maybeToday }: ProfileState,
  h: ProfileViewBuilder,
) => {
  const i18n = translatorFor(language)

  return sample(
    {
      i18n,
      title: i18n._(msg`Posts`),
      loadingLabel: i18n._(msg`Loading posts`),
      icon: Icons.clipboard,
      asyncData: model.publicationsAsyncData,
      footerLink: {
        label: i18n._(msg`All posts`),
        href: profileUrl(language, { handle: page.handle, tab: "Publications" }),
      },
      loadingShape: "cards",
      render: (all) =>
        h.div(
          styledAttributes([], carouselStyle, cardBleedStyle),
          all
            .slice(0, PREVIEW_PUBLICATION_COUNT)
            .map((publication) =>
              h.keyed("div")(publication.id, styledAttributes([], carouselItemStyle), [
                PublicationCard.view({ language, publication, maybeToday }, h),
              ]),
            ),
        ),
    },
    h,
  )
}

const photos = ({ model, language, page }: ProfileState, h: ProfileViewBuilder) => {
  const i18n = translatorFor(language)

  return sample(
    {
      i18n,
      title: i18n._(msg`Photos`),
      loadingLabel: i18n._(msg`Loading photos`),
      icon: Icons.gallery,
      asyncData: model.photosAsyncData,
      footerLink: {
        label: i18n._(msg`See all photos`),
        href: profileUrl(language, { handle: page.handle, tab: "Photos" }),
      },
      loadingShape: "tiles",
      render: (media) => {
        const all = galleryPhotos({ media, language })
        const remaining = all.length - PREVIEW_PHOTO_COUNT

        return h.div(styledAttributes([], photoStripStyle, cardBleedStyle), [
          ...all.slice(0, PREVIEW_PHOTO_COUNT).map((photo) => {
            const { width, height } = Option.getOrElse(photo.maybeDimensions, () => ({
              width: 1,
              height: 1,
            }))

            return h.keyed("img")(
              photo.key,
              styledAttributes(
                [
                  h.Src(photo.src(300)),
                  h.Alt(Option.getOrElse(photo.maybeCaption, () => "")),
                  h.Attribute("width", String(width)),
                  h.Attribute("height", String(height)),
                  h.Attribute("loading", "lazy"),
                  h.Style({ "aspect-ratio": `${width} / ${height}` }),
                ],
                photoThumbnailStyle,
              ),
            )
          }),
          ...(remaining > 0
            ? [
                h.a(
                  styledAttributes(
                    [h.Href(profileUrl(language, { handle: page.handle, tab: "Photos" }))],
                    morePhotosStyle,
                  ),
                  [`+${remaining}`],
                ),
              ]
            : []),
        ])
      },
    },
    h,
  )
}

const bookmarks = ({ model, language, page }: ProfileState, h: ProfileViewBuilder) => {
  const i18n = translatorFor(language)

  return sample(
    {
      i18n,
      title: i18n._(msg({ message: "Saved", context: "profile collection" })),
      loadingLabel: i18n._(msg`Loading saved articles`),
      icon: Icons.bookmark,
      asyncData: model.bookmarksAsyncData,
      footerLink: {
        label: i18n._(msg`See everything saved`),
        href: profileUrl(language, { handle: page.handle, tab: "Bookmarks" }),
      },
      loadingShape: "rows",
      render: (all) =>
        h.div(
          styledAttributes([], listStyle),
          all.slice(0, PREVIEW_BOOKMARK_COUNT).map((bookmark) =>
            h.keyed("div")(
              bookmark.article.id,
              [],
              [
                WikiArticleRow.view(
                  {
                    article: bookmark.article,
                    language,
                    maybeBookmarkState: Option.some(bookmark.state),
                  },
                  h,
                ),
              ],
            ),
          ),
        ),
    },
    h,
  )
}

const contributions = ({ model, language, page }: ProfileState, h: ProfileViewBuilder) => {
  const i18n = translatorFor(language)

  return sample(
    {
      i18n,
      title: i18n._(msg`In the encyclopedia`),
      loadingLabel: i18n._(msg`Loading contributions`),
      icon: Icons.encyclopedia,
      asyncData: model.contributionsAsyncData,
      footerLink: {
        label: i18n._(msg`All contributions`),
        href: profileUrl(language, { handle: page.handle, tab: "Contributions" }),
      },
      loadingShape: "rows",
      render: (all) =>
        h.div(
          styledAttributes([], listStyle),
          all.slice(0, PREVIEW_CONTRIBUTION_COUNT).map((contribution) =>
            h.keyed("div")(
              contribution.article.id,
              [],
              [
                WikiArticleRow.view(
                  {
                    article: contribution.article,
                    language,
                    maybeSubtitle: Option.some(contributionSummary({ ...contribution, i18n })),
                  },
                  h,
                ),
              ],
            ),
          ),
        ),
    },
    h,
  )
}

/** Once everything has loaded empty and there's no bio, one message replaces the sections. */
const isEmptyProfile = ({ model, page }: ProfileState): boolean =>
  page.bio === null &&
  isEmptyData(model.publicationsAsyncData) &&
  isEmptyData(model.photosAsyncData) &&
  isEmptyData(model.bookmarksAsyncData) &&
  isEmptyData(model.contributionsAsyncData)

/** A sample of everything the profile shares, each linking to its tab. */
export const view = (state: ProfileState, h: ProfileViewBuilder): Html => {
  const i18n = translatorFor(state.language)
  const { name } = state.page

  return isEmptyProfile(state)
    ? h.div(styledAttributes([], sectionsStyle), [
        EmptyState.view(
          {
            icon: Icons.sprout,
            title: i18n._(msg`${name} hasn't shared anything here yet`),
            maybeDescription: Option.some(
              i18n._(msg`Posts, photos and saved articles show up here as soon as they're shared.`),
            ),
            size: "roomy",
          },
          h,
        ),
      ])
    : h.div(styledAttributes([], sectionsStyle, layoutStyle), [
        h.div(styledAttributes([], columnStyle), [
          ...bio(state, h),
          ...publications(state, h),
          ...photos(state, h),
        ]),
        h.aside(styledAttributes([h.AriaLabel(i18n._(msg`What ${name} follows`))], columnStyle), [
          ...bookmarks(state, h),
          ...contributions(state, h),
        ]),
      ])
}
