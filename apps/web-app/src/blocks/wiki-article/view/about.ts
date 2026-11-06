import type { WikiArticleContributor } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, HashMap, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { wikiArticleUrl } from "../../../app/route"
import { bookmarkVocabularies, wikiKindLabels } from "../../../lib/vocabulary"
import { aboutName, ofName } from "../../../lib/wiki-article-names"
import { AppText } from "../../../ui/app-text"
import { EmptyState } from "../../../ui/empty-state"
import { FilterChips } from "../../../ui/filter-chips"
import * as Icons from "../../../ui/icons"
import * as PlaceOutline from "../../../ui/place-outline/view"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { ProfileRow } from "../../../ui/profile-row"
import { PublicationCard } from "../../../ui/publication-card"
import { RichText } from "../../../ui/rich-text"
import { SectionCard, cardBleedStyle } from "../../../ui/section-card"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { breakpoint, fontWeight, radius, space, toneColors, tones } from "../../../ui/theme"
import { WikiArticleRow } from "../../../ui/wiki-article-row"
import type { WikiArticleViewBuilder } from "../composition"
import { Message } from "../message"
import { type Model } from "../model"
import { photoCredit } from "./attribution"
import * as BookmarkPicker from "./bookmark-picker"
import * as ChildPlaces from "./child-places"
import * as ExternalData from "./external-data"
import * as Overview from "./overview"
import { type ArticlePhoto, articlePhotos } from "./photos"
import { type ArticleState, type Page, asyncView, listStyle, sectionsStyle } from "./shared"

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
  flex: "0 0 100%",
  scrollSnapAlign: "center",
  aspectRatio: "4 / 3",
  maxBlockSize: "30rem",
  margin: 0,
  overflow: "hidden",
  borderRadius: radius.lg,
})

const heroLinkStyle = Style.make({
  display: "block",
  blockSize: "100%",
  borderRadius: radius.lg,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

/** With more photos, the next one peeks in so the strip reads as scrollable. */
const heroSlidePeekStyle = Style.make({ flexBasis: "88%" })

const heroImageStyle = Style.make({ inlineSize: "100%", blockSize: "100%", objectFit: "cover" })

const heroCaptionStyle = Style.make({
  position: "absolute",
  display: "grid",
  rowGap: space[1],
  insetInline: space[4],
  insetBlockEnd: space[4],
  padding: space[3],
  borderRadius: radius.lg,
  backgroundColor: tones.primary.backgroundCard,
  color: tones.neutral.shade[800],
})

const carouselStyle = Style.make({
  display: "flex",
  gap: space[3],
  overflowX: "auto",
  scrollSnapType: "x mandatory",
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

/** A photo's description, over its lower edge. */
const heroCaption = (photo: ArticlePhoto, h: WikiArticleViewBuilder): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(photo.maybeCaption, (text) =>
      h.figcaption(styledAttributes([], heroCaptionStyle), [
        AppText.view({ element: "span", appearance: "footnote", children: [text] }, h),
      ]),
    ),
  )

/** Featured photos; each opens the article's photos. */
const hero = (
  { model, page }: Readonly<{ model: Model; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.match(articlePhotos(page).slice(0, HERO_PHOTO_COUNT), {
    onEmpty: () => [],
    onNonEmpty: (slides) => [
      h.div(
        styledAttributes([h.Role("group"), h.AriaLabel("Fotos em destaque")], heroStyle),
        slides.map((photo) =>
          h.keyed("figure")(
            photo.key,
            styledAttributes(
              [],
              heroSlideStyle,
              ...(slides.length > 1 ? [heroSlidePeekStyle] : []),
            ),
            [
              h.a(
                styledAttributes(
                  [
                    h.Href(wikiArticleUrl(page, "Photos")),
                    h.AriaLabel(`Ver fotos ${ofName(page)}`),
                  ],
                  heroLinkStyle,
                ),
                [
                  h.img(
                    styledAttributes(
                      [
                        h.Src(photo.src(1280)),
                        h.Alt(Option.getOrElse(photo.maybeCaption, () => "")),
                      ],
                      heroImageStyle,
                    ),
                  ),
                ],
              ),
              ...heroCaption(photo, h),
              ...photoCredit({ model, photo, corner: "topEnd" }, h),
            ],
          ),
        ),
      ),
    ],
  })

const bookmarkers = ({ model, page }: ArticleState, h: WikiArticleViewBuilder): Html => {
  const groupLabels = bookmarkVocabularies[page.kind].groups

  return SectionCard.view(
    {
      title: groupLabels.INTERESTED,
      icon: Icons.heart,
      children: [
        FilterChips.view(
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
            loading: { label: "Carregando quem acompanha", shape: "rows", count: 2 },
            onData: (all) =>
              EffectArray.match(
                all.filter((bookmarker) =>
                  Option.match(model.maybeBookmarkerFilter, {
                    onNone: () => true,
                    onSome: (state) => bookmarker.state === state,
                  }),
                ),
                {
                  onEmpty: () =>
                    EmptyState.view(
                      {
                        icon: Icons.heart,
                        title: "Ninguém por aqui ainda",
                        maybeDescription: Option.some(
                          "Salve este artigo para aparecer aqui e encontrar quem se interessa pelo mesmo.",
                        ),
                      },
                      h,
                    ),
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

/** Only shown once it has posts: an empty preview would only repeat the Posts tab's empty state. */
const publicationsPreview = (
  { model, page, maybeToday }: ArticleState,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.filter(
      AsyncData.getData(model.publicationsAsyncData),
      EffectArray.isReadonlyArrayNonEmpty,
    ),
  ).map((publications) =>
    SectionCard.view(
      {
        title: "Posts",
        icon: Icons.clipboard,
        footerLink: {
          label: `Todos os posts sobre ${aboutName(page)}`,
          href: wikiArticleUrl(page, "Publications"),
        },
        children: [
          h.div(
            styledAttributes([], carouselStyle, cardBleedStyle),
            publications
              .slice(0, PREVIEW_PUBLICATION_COUNT)
              .map((publication) =>
                h.keyed("div")(publication.id, styledAttributes([], carouselItemStyle), [
                  PublicationCard.view({ publication, maybeToday }, h),
                ]),
              ),
          ),
        ],
      },
      h,
    ),
  )

const cultivarItemStyle = Style.make({
  flex: "0 0 min(20rem, 85%)",
  scrollSnapAlign: "start",
})

/** A plant's varieties, each a card with its photo. Only shown when the plant has some. */
const cultivars = (
  { model, page }: Readonly<{ model: Model; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.filter(AsyncData.getData(model.cultivarsAsyncData), EffectArray.isReadonlyArrayNonEmpty),
  ).map((varieties) =>
    SectionCard.view(
      {
        title: `Variedades ${ofName(page)}`,
        icon: Icons.layers,
        children: [
          h.div(
            styledAttributes([], carouselStyle, cardBleedStyle),
            varieties.map((cultivar) =>
              h.keyed("div")(cultivar.id, styledAttributes([], cultivarItemStyle), [
                WikiArticleRow.view(
                  {
                    article: cultivar,
                    maybeBookmarkState: HashMap.get(model.viewerBookmarks, cultivar.id),
                    isCard: true,
                  },
                  h,
                ),
              ]),
            ),
          ),
        ],
      },
      h,
    ),
  )

/** Only shown once it has articles: an empty "related" list says nothing useful. */
const related = (model: Model, h: WikiArticleViewBuilder): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(
      Option.filter(AsyncData.getData(model.relatedAsyncData), EffectArray.isReadonlyArrayNonEmpty),
      (articles) => {
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
                FilterChips.view(
                  {
                    label: "Filtrar por tipo",
                    options: kinds.map((kind) => [kind, wikiKindLabels[kind].plural] as const),
                    selected: model.maybeRelatedKindFilter,
                    toMessage: (maybeKind) => Message.ClickedRelatedKindFilter({ maybeKind }),
                  },
                  h,
                ),
              ]
            : []),
          ...EffectArray.match(shown, {
            onEmpty: () => [
              EmptyState.view({ icon: Icons.encyclopedia, title: "Nenhum artigo desse tipo" }, h),
            ],
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
    ),
  ).map((content) =>
    SectionCard.view(
      { title: "Artigos relacionados", icon: Icons.encyclopedia, children: [content] },
      h,
    ),
  )

const photosPreview = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> => {
  const photos = articlePhotos(page)
  const remaining = photos.length - PREVIEW_PHOTO_COUNT

  // A single photo is already the hero's; repeating it here adds nothing.
  return photos.length <= 1
    ? []
    : [
        SectionCard.view(
          {
            title: "Fotos",
            icon: Icons.gallery,
            footerLink: { label: "Ver todas as fotos", href: wikiArticleUrl(page, "Photos") },
            children: [
              h.div(styledAttributes([], photoStripStyle, cardBleedStyle), [
                ...photos
                  .slice(0, PREVIEW_PHOTO_COUNT)
                  .map((photo) =>
                    h.keyed("img")(
                      photo.key,
                      styledAttributes(
                        [
                          h.Src(photo.src(300)),
                          h.Alt(Option.getOrElse(photo.maybeCaption, () => "")),
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
      ]
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
            loading: { label: "Carregando contribuições", shape: "rows", count: 2 },
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
    onEmpty: () =>
      EmptyState.view(
        {
          icon: Icons.users,
          title: "Nenhuma contribuição pública ainda",
          maybeDescription: Option.some("Que tal ser a primeira pessoa a sugerir uma edição?"),
        },
        h,
      ),
    onNonEmpty: (shown) =>
      h.div(
        styledAttributes([], listStyle),
        shown.map((contributor) =>
          h.keyed("div")(contributor.profile.id, [], [contributorRow({ contributor, size }, h)]),
        ),
      ),
  })

const mapStyle = Style.make({ maxInlineSize: "24rem", marginInline: "auto" })

/** Where a gazetteer place lies: its outline, inside the place containing it. */
const placeMap = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> => {
  if (page.kind !== "PLACE" || page.map === null) {
    return []
  }

  const { place, surroundings } = page.map

  return [
    SectionCard.view(
      {
        title: "Onde fica",
        icon: Icons.mapPoint,
        children: [
          h.div(styledAttributes([], mapStyle), [
            PlaceOutline.view(
              {
                geometry: place.geometry,
                boundingBox: place.boundingBox,
                label: place.name,
                ...Option.match(surroundings, {
                  onNone: () => ({}),
                  onSome: (outline) => ({
                    surroundings: {
                      geometry: outline.geometry,
                      boundingBox: outline.boundingBox,
                      label: outline.name,
                    },
                  }),
                }),
              },
              h,
            ),
          ]),
        ],
      },
      h,
    ),
  ]
}

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
      ...ordered({ order: 1, children: hero({ model, page }, h) }, h),
      ...ordered({ order: 3, children: [Overview.view(page, h), ...placeMap(page, h)] }, h),
      ...ordered({ order: 4, children: cultivars({ model, page }, h) }, h),
      ...ordered({ order: 4, children: ChildPlaces.view({ model, page }, h) }, h),
      ...ordered({ order: 6, children: ExternalData.editions({ model, page }, h) }, h),
      ...ordered({ order: 6, children: aboutContent(page, h) }, h),
      ...ordered({ order: 7, children: publicationsPreview({ model, page, maybeToday }, h) }, h),
      ...ordered({ order: 8, children: related(model, h) }, h),
      ...ordered({ order: 9, children: photosPreview(page, h) }, h),
    ]),
    h.aside(styledAttributes([h.AriaLabel(`Quem acompanha ${aboutName(page)}`)], columnStyle), [
      ...ordered({ order: 2, children: [BookmarkPicker.view({ model, page, isSignedIn }, h)] }, h),
      ...ordered({ order: 5, children: [bookmarkers({ model, page, maybeToday }, h)] }, h),
      ...ordered(
        { order: 10, children: [contributionsPreview({ model, page, maybeToday }, h)] },
        h,
      ),
    ]),
  ])
