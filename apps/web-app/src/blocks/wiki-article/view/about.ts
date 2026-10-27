import { BookmarkState } from "@gororobas/domain/common/enums"
import type { WikiArticleContributor } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, HashMap, Option, Record } from "effect"
import type { Html } from "foldkit/html"

import { loginRouter, wikiArticleUrl } from "../../../app/route"
import {
  bookmarkLabels,
  bookmarkerGroupLabels,
  plantBookmarkLabels,
  plantBookmarkerGroupLabels,
  wikiKindLabels,
} from "../../../lib/vocabulary"
import { aboutName, ofName } from "../../../lib/wiki-article-names"
import { imageUrl } from "../../../media-urls"
import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { ProfileRow } from "../../../ui/profile-row"
import { PublicationCard } from "../../../ui/publication-card"
import { RichText } from "../../../ui/rich-text"
import { SectionCard } from "../../../ui/section-card"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import {
  breakpoint,
  controlSize,
  fontSize,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
} from "../../../ui/theme"
import { WikiArticleRow } from "../../../ui/wiki-article-row"
import type { WikiArticleViewBuilder } from "../composition"
import { Message } from "../message"
import { BookmarkSaving, type Model } from "../model"
import * as PlantOverview from "./plant-overview"
import {
  type ArticleState,
  type Page,
  asyncView,
  caption,
  emptyState,
  filterChips,
  images,
  listStyle,
  sectionsStyle,
} from "./shared"

const HERO_PHOTO_COUNT = 5
const PREVIEW_PUBLICATION_COUNT = 4
const PREVIEW_PHOTO_COUNT = 5
const PREVIEW_RELATED_COUNT = 8
const PREVIEW_CONTRIBUTOR_COUNT = 3

// SHARED STYLES

const heroStyle = Style.make({
  display: "flex",
  gap: space[3],
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  scrollbarWidth: "none",
})

const heroSlideStyle = Style.make({
  position: "relative",
  display: "block",
  flex: "0 0 100%",
  scrollSnapAlign: "center",
  aspectRatio: "4 / 3",
  maxBlockSize: "30rem",
  overflow: "hidden",
  borderRadius: radius.lg,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

/** With more photos, the next one peeks in so the strip reads as scrollable. */
const heroSlidePeekStyle = Style.make({ flexBasis: "88%" })

const heroImageStyle = Style.make({ inlineSize: "100%", blockSize: "100%", objectFit: "cover" })

const heroCaptionStyle = Style.make({
  position: "absolute",
  insetInline: space[4],
  insetBlockEnd: space[4],
  padding: space[3],
  borderRadius: radius.lg,
  backgroundColor: tones.primary.backgroundCard,
  color: tones.neutral.ramp[800],
})

const bookmarkStyle = Style.make({ display: "grid", rowGap: space[2] })

const bookmarkSelectStyle = Style.make({
  inlineSize: "100%",
  blockSize: controlSize.lg,
  paddingInline: space[4],
  border: `2px solid ${tones.neutral.ramp[600]}`,
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[900],
  fontSize: fontSize.regular,
  cursor: "pointer",
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const bookmarkLinkStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  blockSize: controlSize.lg,
  paddingInline: space[4],
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[900],
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const carouselStyle = Style.make({
  display: "flex",
  gap: space[3],
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  scrollbarWidth: "thin",
  paddingBlockEnd: space[1],
})

const carouselItemStyle = Style.make({
  flex: "0 0 min(22rem, 88%)",
  scrollSnapAlign: "start",
})
const photoStripStyle = Style.make({ display: "flex", gap: space[3], overflowX: "auto" })

const photoThumbnailStyle = Style.make({
  flex: "0 0 auto",
  blockSize: "6.5rem",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: radius.md,
})

const morePhotosStyle = Style.make({
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  blockSize: "6.5rem",
  aspectRatio: "4 / 3",
  borderRadius: radius.md,
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[700],
  fontWeight: fontWeight.semibold,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const contributorCountStyle = Style.make({ display: "grid", justifyItems: "end", textAlign: "end" })
const contentStyle = Style.make({ color: toneColors.foreground })

// SECTIONS

/** Featured photos; each opens the article's photos. */
const hero = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> =>
  EffectArray.match(images(page).slice(0, HERO_PHOTO_COUNT), {
    onEmpty: () => [],
    onNonEmpty: (slides) => [
      h.div(
        styledAttributes([h.Role("group"), h.AriaLabel("Fotos em destaque")], heroStyle),
        slides.map((photo) =>
          h.keyed("a")(
            photo.id,
            styledAttributes(
              [h.Href(wikiArticleUrl(page, "Photos")), h.AriaLabel(`Ver fotos ${ofName(page)}`)],
              heroSlideStyle,
              ...(slides.length > 1 ? [heroSlidePeekStyle] : []),
            ),
            [
              h.img(
                styledAttributes(
                  [
                    h.Src(imageUrl(photo.id, 1280)),
                    h.Alt(Option.getOrElse(caption(photo), () => "")),
                  ],
                  heroImageStyle,
                ),
              ),
              ...EffectArray.fromOption(
                Option.map(caption(photo), (text) =>
                  h.span(styledAttributes([], heroCaptionStyle), [
                    AppText.view({ element: "span", appearance: "footnote", children: [text] }, h),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  })

const bookmarkPicker = (
  { model, page, isSignedIn }: ArticleState & Readonly<{ isSignedIn: boolean }>,
  h: WikiArticleViewBuilder,
): Html => {
  const labels = page.kind === "PLANT" ? plantBookmarkLabels : bookmarkLabels
  const maybeState = HashMap.get(model.viewerBookmarks, page.id)
  const decode = (value: string) =>
    Option.liftPredicate(value, (candidate): candidate is BookmarkState =>
      BookmarkState.literals.some((state) => state === candidate),
    )

  if (!isSignedIn) {
    return h.a(styledAttributes([h.Href(loginRouter())], bookmarkLinkStyle), [
      Icons.bookmark({ size: "md" }),
      `${labels.INTERESTED}? Entre para salvar`,
    ])
  }

  return h.div(styledAttributes([], bookmarkStyle), [
    h.select(
      styledAttributes(
        [
          h.AriaLabel("Sua relação com este artigo"),
          h.Disabled(BookmarkSaving.guards.Saving(model.bookmarkSaving)),
          h.OnChange((value) => Message.SelectedBookmarkState({ maybeState: decode(value) })),
        ],
        bookmarkSelectStyle,
      ),
      [
        h.option(
          [h.Value(""), h.Selected(Option.isNone(maybeState))],
          [Option.isNone(maybeState) ? "Salvar na minha lista…" : "Remover da minha lista"],
        ),
        ...Record.toEntries(labels).map(([state, label]) =>
          h.option([h.Value(state), h.Selected(Option.contains(maybeState, state))], [label]),
        ),
      ],
    ),
    ...(BookmarkSaving.guards.Failed(model.bookmarkSaving)
      ? [
          AppText.view(
            {
              element: "p",
              appearance: "footnote",
              tone: "destructive",
              attributes: [h.Role("alert")],
              children: [model.bookmarkSaving.error],
            },
            h,
          ),
        ]
      : []),
  ])
}

const bookmarkers = ({ model, page }: ArticleState, h: WikiArticleViewBuilder): Html => {
  const groupLabels = page.kind === "PLANT" ? plantBookmarkerGroupLabels : bookmarkerGroupLabels

  return SectionCard.view(
    {
      title: groupLabels.INTERESTED,
      icon: Icons.heart,
      children: [
        filterChips(
          {
            label: "Filtrar por situação",
            options: (["INTERESTED", "ACTIVE", "PREVIOUSLY_ACTIVE"] as const).map(
              (state) => [state, groupLabels[state]] as const,
            ),
            selected: model.maybeBookmarkerFilter,
            toMessage: (maybeState) => Message.ClickedBookmarkerFilter({ maybeState }),
          },
          h,
        ),
        asyncView(
          {
            asyncData: model.bookmarkersAsyncData,
            onData: (all) =>
              EffectArray.match(
                all.filter((bookmarker) =>
                  Option.match(model.maybeBookmarkerFilter, {
                    onNone: () => true,
                    onSome: (state) => bookmarker.state === state,
                  }),
                ),
                {
                  onEmpty: () => emptyState("Ninguém por aqui ainda.", h),
                  onNonEmpty: (shown) =>
                    h.div(
                      styledAttributes([], listStyle),
                      shown.map((bookmarker) =>
                        h.keyed("div")(
                          bookmarker.profile.id,
                          [],
                          [ProfileRow.view({ profile: bookmarker.profile }, h)],
                        ),
                      ),
                    ),
                },
              ),
          },
          h,
        ),
      ],
    },
    h,
  )
}

const aboutContent = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(page.content, (content) =>
      SectionCard.view(
        {
          title: `Sobre ${aboutName(page)}`,
          icon: Icons.bulb,
          children: [h.div(styledAttributes([], contentStyle), [RichText.view(content, h)])],
        },
        h,
      ),
    ),
  )

const publicationsPreview = (
  { model, page, maybeToday }: ArticleState,
  h: WikiArticleViewBuilder,
): Html =>
  SectionCard.view(
    {
      title: "Posts",
      icon: Icons.clipboard,
      footerLink: {
        label: `Todos os posts sobre ${aboutName(page)}`,
        href: wikiArticleUrl(page, "Publications"),
      },
      children: [
        asyncView(
          {
            asyncData: model.publicationsAsyncData,
            onData: (publications) =>
              EffectArray.match(publications.slice(0, PREVIEW_PUBLICATION_COUNT), {
                onEmpty: () => emptyState(`Ainda não há posts sobre ${aboutName(page)}.`, h),
                onNonEmpty: (shown) =>
                  h.div(
                    styledAttributes([], carouselStyle),
                    shown.map((publication) =>
                      h.keyed("div")(publication.id, styledAttributes([], carouselItemStyle), [
                        PublicationCard.view({ publication, maybeToday }, h),
                      ]),
                    ),
                  ),
              }),
          },
          h,
        ),
      ],
    },
    h,
  )

const related = (model: Model, h: WikiArticleViewBuilder): Html =>
  SectionCard.view(
    {
      title: "Artigos relacionados",
      icon: Icons.encyclopedia,
      children: [
        asyncView(
          {
            asyncData: model.relatedAsyncData,
            onData: (articles) => {
              const kinds = EffectArray.dedupe(articles.map((article) => article.kind))

              const shown = articles
                .filter((article) =>
                  Option.match(model.maybeRelatedKindFilter, {
                    onNone: () => true,
                    onSome: (kind) => article.kind === kind,
                  }),
                )
                .slice(0, PREVIEW_RELATED_COUNT)

              return h.div(styledAttributes([], listStyle), [
                ...(kinds.length > 1
                  ? [
                      filterChips(
                        {
                          label: "Filtrar por tipo",
                          options: kinds.map(
                            (kind) => [kind, wikiKindLabels[kind].plural] as const,
                          ),
                          selected: model.maybeRelatedKindFilter,
                          toMessage: (maybeKind) => Message.ClickedRelatedKindFilter({ maybeKind }),
                        },
                        h,
                      ),
                    ]
                  : []),
                ...EffectArray.match(shown, {
                  onEmpty: () => [emptyState("Nenhum artigo relacionado ainda.", h)],
                  onNonEmpty: (nonEmpty) =>
                    nonEmpty.map((article) =>
                      h.keyed("div")(
                        article.id,
                        [],
                        [
                          WikiArticleRow.view(
                            {
                              article,
                              maybeBookmarkState: HashMap.get(model.viewerBookmarks, article.id),
                            },
                            h,
                          ),
                        ],
                      ),
                    ),
                }),
              ])
            },
          },
          h,
        ),
      ],
    },
    h,
  )

const photosPreview = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> => {
  const photos = images(page)
  const remaining = photos.length - PREVIEW_PHOTO_COUNT

  return EffectArray.match(photos, {
    onEmpty: () => [],
    onNonEmpty: () => [
      SectionCard.view(
        {
          title: "Fotos",
          icon: Icons.gallery,
          footerLink: { label: "Ver todas as fotos", href: wikiArticleUrl(page, "Photos") },
          children: [
            h.div(styledAttributes([], photoStripStyle), [
              ...photos
                .slice(0, PREVIEW_PHOTO_COUNT)
                .map((photo) =>
                  h.keyed("img")(
                    photo.id,
                    styledAttributes(
                      [
                        h.Src(imageUrl(photo.id, 300)),
                        h.Alt(Option.getOrElse(caption(photo), () => "")),
                        h.Attribute("loading", "lazy"),
                      ],
                      photoThumbnailStyle,
                    ),
                  ),
                ),
              ...(remaining > 0
                ? [
                    h.a(
                      styledAttributes([h.Href(wikiArticleUrl(page, "Photos"))], morePhotosStyle),
                      [`+${remaining}`],
                    ),
                  ]
                : []),
            ]),
          ],
        },
        h,
      ),
    ],
  })
}

const contributionsPreview = ({ model, page }: ArticleState, h: WikiArticleViewBuilder): Html =>
  SectionCard.view(
    {
      title: "Contribuições",
      icon: Icons.users,
      footerLink: { label: "Ver contribuições", href: wikiArticleUrl(page, "Contributions") },
      children: [
        AppText.view(
          {
            element: "p",
            children: [
              `O Gororobas é colaborativo, você também pode sugerir uma edição pra página ${ofName(page)}.`,
            ],
          },
          h,
        ),
        asyncView(
          {
            asyncData: model.contributorsAsyncData,
            onData: (contributors) =>
              contributorList(
                {
                  contributors: contributors.slice(0, PREVIEW_CONTRIBUTOR_COUNT),
                  size: "standard",
                },
                h,
              ),
          },
          h,
        ),
      ],
    },
    h,
  )

const formatMonth = (date: DateTime.Utc): string => DateTime.formatIso(date).slice(0, 7)

type ContributorRowSize = "standard" | "large"

const contributorRow = (
  {
    contributor,
    size,
  }: Readonly<{ contributor: WikiArticleContributor; size: ContributorRowSize }>,
  h: WikiArticleViewBuilder,
): Html =>
  ProfileRow.view(
    {
      profile: contributor.profile,
      size,
      trailing: [
        h.div(styledAttributes([], contributorCountStyle), [
          AppText.view(
            {
              element: "span",
              weight: "medium",
              children: [
                `${contributor.revisionCount} ${contributor.revisionCount === 1 ? "edição" : "edições"}`,
              ],
            },
            h,
          ),
          AppText.view(
            {
              element: "span",
              appearance: "footnote",
              children: [`em ${formatMonth(contributor.lastContributedAt)}`],
            },
            h,
          ),
        ]),
      ],
    },
    h,
  )

export const contributorList = (
  {
    contributors,
    size,
  }: Readonly<{ contributors: ReadonlyArray<WikiArticleContributor>; size: ContributorRowSize }>,
  h: WikiArticleViewBuilder,
): Html =>
  EffectArray.match(contributors, {
    onEmpty: () => emptyState("Nenhuma contribuição pública ainda.", h),
    onNonEmpty: (shown) =>
      h.div(
        styledAttributes([], listStyle),
        shown.map((contributor) =>
          h.keyed("div")(contributor.profile.id, [], [contributorRow({ contributor, size }, h)]),
        ),
      ),
  })

/** One column on small screens, in reading order. Wide screens move the reader's own
 *  relationship to the article, and the people around it, into a sidebar. */
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

/** The columns dissolve on small screens so their sections interleave by `order`. */
const columnStyle = Style.make({ display: "contents" }).pipe(
  Style.when(breakpoint.lg, { display: "flex", flexDirection: "column", rowGap: space[6] }),
)

const orderStyle = (order: number) => Style.make({ order })

const ordered = (
  { order, children }: Readonly<{ order: number; children: ReadonlyArray<Html> }>,
  h: WikiArticleViewBuilder,
) => children.map((child) => h.div(styledAttributes([], orderStyle(order)), [child]))

export const view = (
  { model, page, maybeToday, isSignedIn }: ArticleState & Readonly<{ isSignedIn: boolean }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], sectionsStyle, layoutStyle), [
    h.div(styledAttributes([], columnStyle), [
      ...ordered({ order: 1, children: hero(page, h) }, h),
      ...ordered(
        { order: 3, children: page.kind === "PLANT" ? [PlantOverview.view(page, h)] : [] },
        h,
      ),
      ...ordered({ order: 5, children: aboutContent(page, h) }, h),
      ...ordered({ order: 6, children: [publicationsPreview({ model, page, maybeToday }, h)] }, h),
      ...ordered({ order: 7, children: [related(model, h)] }, h),
      ...ordered({ order: 8, children: photosPreview(page, h) }, h),
    ]),
    h.aside(styledAttributes([h.AriaLabel(`Quem acompanha ${aboutName(page)}`)], columnStyle), [
      ...ordered(
        { order: 2, children: [bookmarkPicker({ model, page, maybeToday, isSignedIn }, h)] },
        h,
      ),
      ...ordered({ order: 4, children: [bookmarkers({ model, page, maybeToday }, h)] }, h),
      ...ordered({ order: 9, children: [contributionsPreview({ model, page, maybeToday }, h)] }, h),
    ]),
  ])
