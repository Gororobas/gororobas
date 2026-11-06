import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { profileUrl } from "../../../app/route"
import type { ClientFailure } from "../../../lib/client-failure"
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
    icon,
    asyncData,
    footerLink,
    loadingShape,
    render,
  }: Readonly<{
    title: string
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
                  asyncData,
                  loading: {
                    label: `Carregando ${title.toLowerCase()}`,
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

const bio = ({ page }: ProfileState, h: ProfileViewBuilder): ReadonlyArray<Html> =>
  page.bio === null
    ? []
    : [
        SectionCard.view(
          {
            title: "Sobre",
            icon: Icons.user,
            children: [h.div(styledAttributes([], bioStyle), [RichText.view(page.bio, h)])],
          },
          h,
        ),
      ]

const publications = ({ model, page, maybeToday }: ProfileState, h: ProfileViewBuilder) =>
  sample(
    {
      title: "Publicações",
      icon: Icons.clipboard,
      asyncData: model.publicationsAsyncData,
      footerLink: { label: "Todas as publicações", href: profileUrl(page.handle, "Publications") },
      loadingShape: "cards",
      render: (all) =>
        h.div(
          styledAttributes([], carouselStyle, cardBleedStyle),
          all
            .slice(0, PREVIEW_PUBLICATION_COUNT)
            .map((publication) =>
              h.keyed("div")(publication.id, styledAttributes([], carouselItemStyle), [
                PublicationCard.view({ publication, maybeToday }, h),
              ]),
            ),
        ),
    },
    h,
  )

const photos = ({ model, page }: ProfileState, h: ProfileViewBuilder) =>
  sample(
    {
      title: "Fotos",
      icon: Icons.gallery,
      asyncData: model.photosAsyncData,
      footerLink: { label: "Ver todas as fotos", href: profileUrl(page.handle, "Photos") },
      loadingShape: "tiles",
      render: (media) => {
        const all = galleryPhotos(media)
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
                  styledAttributes([h.Href(profileUrl(page.handle, "Photos"))], morePhotosStyle),
                  [`+${remaining}`],
                ),
              ]
            : []),
        ])
      },
    },
    h,
  )

const bookmarks = ({ model, page }: ProfileState, h: ProfileViewBuilder) =>
  sample(
    {
      title: "Salvos",
      icon: Icons.bookmark,
      asyncData: model.bookmarksAsyncData,
      footerLink: { label: "Ver todos os salvos", href: profileUrl(page.handle, "Bookmarks") },
      loadingShape: "rows",
      render: (all) =>
        h.div(
          styledAttributes([], listStyle),
          all
            .slice(0, PREVIEW_BOOKMARK_COUNT)
            .map((bookmark) =>
              h.keyed("div")(
                bookmark.article.id,
                [],
                [
                  WikiArticleRow.view(
                    { article: bookmark.article, maybeBookmarkState: Option.some(bookmark.state) },
                    h,
                  ),
                ],
              ),
            ),
        ),
    },
    h,
  )

const contributions = ({ model, page }: ProfileState, h: ProfileViewBuilder) =>
  sample(
    {
      title: "Na enciclopédia",
      icon: Icons.encyclopedia,
      asyncData: model.contributionsAsyncData,
      footerLink: {
        label: "Todas as contribuições",
        href: profileUrl(page.handle, "Contributions"),
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
                    maybeSubtitle: Option.some(contributionSummary(contribution)),
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

/** Once everything has loaded empty and there's no bio, one message replaces the sections. */
const isEmptyProfile = ({ model, page }: ProfileState): boolean =>
  page.bio === null &&
  isEmptyData(model.publicationsAsyncData) &&
  isEmptyData(model.photosAsyncData) &&
  isEmptyData(model.bookmarksAsyncData) &&
  isEmptyData(model.contributionsAsyncData)

/** A sample of everything the profile shares, each linking to its tab. */
export const view = (state: ProfileState, h: ProfileViewBuilder): Html =>
  isEmptyProfile(state)
    ? h.div(styledAttributes([], sectionsStyle), [
        EmptyState.view(
          {
            icon: Icons.sprout,
            title: `${state.page.name} ainda não compartilhou nada por aqui`,
            maybeDescription: Option.some(
              "Publicações, fotos e artigos salvos aparecem aqui assim que forem compartilhados.",
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
        h.aside(
          styledAttributes([h.AriaLabel(`O que ${state.page.name} acompanha`)], columnStyle),
          [...bookmarks(state, h), ...contributions(state, h)],
        ),
      ])
