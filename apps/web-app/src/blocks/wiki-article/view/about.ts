import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { WikiArticleContributor } from "@gororobas/domain/wiki/domain"
import { msg, plural, select } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, HashMap, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { wikiArticleUrl } from "../../../app/route"
import { intlTags } from "../../../lib/language"
import { translateLabels, translatorFor } from "../../../lib/translations"
import { bookmarkVocabularies, wikiKindLabels } from "../../../lib/vocabulary"
import { nameParts } from "../../../lib/wiki-article-names"
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
import { UntranslatedNotice } from "../../../ui/untranslated-notice"
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

/** A card the photo sits in whole, uncropped, with its caption below. */
const heroSlideStyle = Style.make({
  display: "flex",
  flexDirection: "column",
  rowGap: space[2],
  flex: "0 0 100%",
  scrollSnapAlign: "center",
  aspectRatio: "4 / 3",
  maxBlockSize: "30rem",
  margin: 0,
  padding: space[4],
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
})

/** Whatever room the caption leaves: the photo grows to fit it in either direction. */
const heroStageStyle = Style.make({
  flex: 1,
  minBlockSize: 0,
  display: "grid",
  placeItems: "center",
  containerType: "size",
})

/** Sized to the photo's own shape, so the credit badge sits on the photo's corner. */
const heroFrameStyle = Style.make({ position: "relative", maxInlineSize: "100%" })

const heroLinkStyle = Style.make({
  display: "block",
  blockSize: "100%",
  overflow: "hidden",
  borderRadius: radius.md,
  backgroundColor: tones.primary.ramp[300],
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

/** With more photos, the next one peeks in so the strip reads as scrollable. */
const heroSlidePeekStyle = Style.make({ flexBasis: "88%" })

const heroImageStyle = Style.make({
  display: "block",
  inlineSize: "100%",
  blockSize: "100%",
  objectFit: "cover",
})

const heroCaptionStyle = Style.make({
  textAlign: "center",
  color: tones.neutral.shade[800],
})

/** Providers don't always tell a photo's size; a landscape frame then stands in for it. */
const UNKNOWN_HERO_DIMENSIONS = { width: 4, height: 3 }

/** As large as the stage allows, keeping the photo's shape: the stage's width or height bounds it. */
const heroFrameSize = (photo: ArticlePhoto) => {
  const { width, height } = Option.getOrElse(photo.maybeDimensions, () => UNKNOWN_HERO_DIMENSIONS)

  return {
    "aspect-ratio": `${width} / ${height}`,
    "inline-size": `min(100cqi, ${(width / height) * 100}cqb)`,
  }
}

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

/** A photo's description, below it. */
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
  { model, language, page }: Readonly<{ model: Model; language: SupportedLanguage; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const i18n = translatorFor(language)
  const { name, gender } = nameParts(page)
  const seePhotosLabel = i18n._(msg`${select(gender, { other: `See photos of ${name}` })}`)

  return EffectArray.match(articlePhotos(page).slice(0, HERO_PHOTO_COUNT), {
    onEmpty: () => [],
    onNonEmpty: (slides) => [
      h.div(
        styledAttributes([h.Role("group"), h.AriaLabel(i18n._(msg`Featured photos`))], heroStyle),
        slides.map((photo) =>
          h.keyed("figure")(
            photo.key,
            styledAttributes(
              [],
              heroSlideStyle,
              ...(slides.length > 1 ? [heroSlidePeekStyle] : []),
            ),
            [
              h.div(styledAttributes([], heroStageStyle), [
                h.div(styledAttributes([h.Style(heroFrameSize(photo))], heroFrameStyle), [
                  h.a(
                    styledAttributes(
                      [
                        h.Href(
                          wikiArticleUrl(language, {
                            kind: page.kind,
                            handle: page.handle,
                            tab: "Photos",
                          }),
                        ),
                        h.AriaLabel(seePhotosLabel),
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
                  ...photoCredit({ model, language, photo, corner: "topEnd" }, h),
                ]),
              ]),
              ...heroCaption(photo, h),
            ],
          ),
        ),
      ),
    ],
  })
}

const bookmarkers = ({ model, language, page }: ArticleState, h: WikiArticleViewBuilder): Html => {
  const i18n = translatorFor(language)
  const groupLabels = translateLabels(i18n, bookmarkVocabularies[page.kind].groups)

  return SectionCard.view(
    {
      title: groupLabels.INTERESTED,
      icon: Icons.heart,
      children: [
        FilterChips.view(
          {
            label: i18n._(msg`Filter by status`),
            allLabel: i18n._(msg`All`),
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
            i18n,
            asyncData: model.bookmarkersAsyncData,
            loading: { label: i18n._(msg`Loading who follows it`), shape: "rows", count: 2 },
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
                        title: i18n._(msg`Nobody here yet`),
                        maybeDescription: Option.some(
                          i18n._(
                            msg`Save this article to show up here and find people interested in it too.`,
                          ),
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
                          [ProfileRow.view({ profile: bookmarker.profile, language }, h)],
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

const aboutContent = (
  { page, language }: Readonly<{ page: Page; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const { name, gender } = nameParts(page)
  const i18n = translatorFor(language)
  const title = i18n._(msg`${select(gender, { other: `About ${name}` })}`)
  const maybeFallback = UntranslatedNotice.maybeFallbackLanguage({
    contentLanguage: page.language,
    readerLanguage: language,
  })

  return EffectArray.fromOption(
    Option.map(page.content, (content) =>
      SectionCard.view(
        {
          title,
          icon: Icons.bulb,
          actions: EffectArray.fromOption(
            Option.map(maybeFallback, (contentLanguage) =>
              UntranslatedNotice.badge({ contentLanguage, readerLanguage: language, i18n }, h),
            ),
          ),
          children: [
            h.div(styledAttributes([h.Lang(page.language)], contentStyle), [
              RichText.view({ document: content, i18n: translatorFor(language) }, h),
            ]),
          ],
        },
        h,
      ),
    ),
  )
}

/** Only shown once it has posts: an empty preview would only repeat the Posts tab's empty state. */
const publicationsPreview = (
  { model, language, page, maybeToday }: ArticleState,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const i18n = translatorFor(language)
  const { name, gender } = nameParts(page)

  return EffectArray.fromOption(
    Option.filter(
      AsyncData.getData(model.publicationsAsyncData),
      EffectArray.isReadonlyArrayNonEmpty,
    ),
  ).map((publications) =>
    SectionCard.view(
      {
        title: i18n._(msg`Publications`),
        icon: Icons.clipboard,
        footerLink: {
          label: i18n._(msg`${select(gender, { other: `All posts about ${name}` })}`),
          href: wikiArticleUrl(language, {
            kind: page.kind,
            handle: page.handle,
            tab: "Publications",
          }),
        },
        children: [
          h.div(
            styledAttributes([], carouselStyle, cardBleedStyle),
            publications
              .slice(0, PREVIEW_PUBLICATION_COUNT)
              .map((publication) =>
                h.keyed("div")(publication.id, styledAttributes([], carouselItemStyle), [
                  PublicationCard.view({ language, publication, maybeToday }, h),
                ]),
              ),
          ),
        ],
      },
      h,
    ),
  )
}

const cultivarItemStyle = Style.make({
  flex: "0 0 min(20rem, 85%)",
  scrollSnapAlign: "start",
})

/** A plant's varieties, each a card with its photo. Only shown when the plant has some. */
const cultivars = (
  { model, language, page }: Readonly<{ model: Model; language: SupportedLanguage; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const { name, gender } = nameParts(page)
  const title = translatorFor(language)._(msg`${select(gender, { other: `Varieties of ${name}` })}`)

  return EffectArray.fromOption(
    Option.filter(AsyncData.getData(model.cultivarsAsyncData), EffectArray.isReadonlyArrayNonEmpty),
  ).map((varieties) =>
    SectionCard.view(
      {
        title,
        icon: Icons.layers,
        children: [
          h.div(
            styledAttributes([], carouselStyle, cardBleedStyle),
            varieties.map((cultivar) =>
              h.keyed("div")(cultivar.id, styledAttributes([], cultivarItemStyle), [
                WikiArticleRow.view(
                  {
                    article: cultivar,
                    language,
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
}

/** Only shown once it has articles: an empty "related" list says nothing useful. */
const related = (
  { model, language }: Readonly<{ model: Model; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const i18n = translatorFor(language)

  return EffectArray.fromOption(
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
                    label: i18n._(msg`Filter by kind`),
                    allLabel: i18n._(msg`All`),
                    options: kinds.map(
                      (kind) => [kind, i18n._(wikiKindLabels[kind].plural)] as const,
                    ),
                    selected: model.maybeRelatedKindFilter,
                    toMessage: (maybeKind) => Message.ClickedRelatedKindFilter({ maybeKind }),
                  },
                  h,
                ),
              ]
            : []),
          ...EffectArray.match(shown, {
            onEmpty: () => [
              EmptyState.view(
                { icon: Icons.encyclopedia, title: i18n._(msg`No articles of this kind`) },
                h,
              ),
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
                        language,
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
      { title: i18n._(msg`Related articles`), icon: Icons.encyclopedia, children: [content] },
      h,
    ),
  )
}

const photosPreview = (
  { page, language }: Readonly<{ page: Page; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const photos = articlePhotos(page)
  const remaining = photos.length - PREVIEW_PHOTO_COUNT
  const i18n = translatorFor(language)

  // A single photo is already the hero's; repeating it here adds nothing.
  return photos.length <= 1
    ? []
    : [
        SectionCard.view(
          {
            title: i18n._(msg`Photos`),
            icon: Icons.gallery,
            footerLink: {
              label: i18n._(msg`See all photos`),
              href: wikiArticleUrl(language, {
                kind: page.kind,
                handle: page.handle,
                tab: "Photos",
              }),
            },
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
                        styledAttributes(
                          [
                            h.Href(
                              wikiArticleUrl(language, {
                                kind: page.kind,
                                handle: page.handle,
                                tab: "Photos",
                              }),
                            ),
                          ],
                          morePhotosStyle,
                        ),
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

const contributionsPreview = (
  { model, language, page }: ArticleState,
  h: WikiArticleViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const { name, gender } = nameParts(page)

  return SectionCard.view(
    {
      title: i18n._(msg`Contributions`),
      icon: Icons.users,
      footerLink: {
        label: i18n._(msg`See contributions`),
        href: wikiArticleUrl(language, {
          kind: page.kind,
          handle: page.handle,
          tab: "Contributions",
        }),
      },
      children: [
        AppText.view(
          {
            element: "p",
            children: [
              i18n._(
                msg`${select(gender, { other: `Gororobas is collaborative: you can also suggest an edit to the page of ${name}.` })}`,
              ),
            ],
          },
          h,
        ),
        asyncView(
          {
            i18n,
            asyncData: model.contributorsAsyncData,
            loading: { label: i18n._(msg`Loading contributions`), shape: "rows", count: 2 },
            onData: (contributors) =>
              contributorList(
                {
                  contributors: contributors.slice(0, PREVIEW_CONTRIBUTOR_COUNT),
                  language,
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
}

const formatMonth = (date: DateTime.Utc, language: SupportedLanguage): string =>
  DateTime.format(date, {
    locale: intlTags[language],
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

type ContributorRowSize = "standard" | "large"

const contributorRow = (
  {
    contributor,
    language,
    size,
  }: Readonly<{
    contributor: WikiArticleContributor
    language: SupportedLanguage
    size: ContributorRowSize
  }>,
  h: WikiArticleViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const month = formatMonth(contributor.lastContributedAt, language)

  return ProfileRow.view(
    {
      profile: contributor.profile,
      language,
      size,
      trailing: [
        h.div(styledAttributes([], contributorCountStyle), [
          AppText.view(
            {
              element: "span",
              weight: "medium",
              children: [
                i18n._(
                  msg`${plural(contributor.revisionCount, { one: "# edit", other: "# edits" })}`,
                ),
              ],
            },
            h,
          ),
          AppText.view(
            {
              element: "span",
              appearance: "footnote",
              children: [i18n._(msg`in ${month}`)],
            },
            h,
          ),
        ]),
      ],
    },
    h,
  )
}

export const contributorList = (
  {
    contributors,
    language,
    size,
  }: Readonly<{
    contributors: ReadonlyArray<WikiArticleContributor>
    language: SupportedLanguage
    size: ContributorRowSize
  }>,
  h: WikiArticleViewBuilder,
): Html =>
  EffectArray.match(contributors, {
    onEmpty: () =>
      EmptyState.view(
        {
          icon: Icons.users,
          title: translatorFor(language)._(msg`No public contributions yet`),
          maybeDescription: Option.some(
            translatorFor(language)._(msg`How about being the first person to suggest an edit?`),
          ),
        },
        h,
      ),
    onNonEmpty: (shown) =>
      h.div(
        styledAttributes([], listStyle),
        shown.map((contributor) =>
          h.keyed("div")(
            contributor.profile.id,
            [],
            [contributorRow({ contributor, language, size }, h)],
          ),
        ),
      ),
  })

const mapStyle = Style.make({ maxInlineSize: "24rem", marginInline: "auto" })

/** Where a gazetteer place lies: its outline, inside the place containing it. */
const placeMap = (
  { page, language }: Readonly<{ page: Page; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  if (page.kind !== "PLACE" || page.map === null) {
    return []
  }

  const { place, surroundings } = page.map

  return [
    SectionCard.view(
      {
        title: translatorFor(language)._(msg`Where it is`),
        icon: Icons.mapPoint,
        children: [
          h.div(styledAttributes([], mapStyle), [
            PlaceOutline.view(
              {
                geometry: place.geometry,
                boundingBox: place.boundingBox,
                label: place.name,
                i18n: translatorFor(language),
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
  {
    model,
    language,
    page,
    maybeToday,
    isSignedIn,
  }: ArticleState & Readonly<{ isSignedIn: boolean }>,
  h: WikiArticleViewBuilder,
): Html => {
  const { name, gender } = nameParts(page)
  const followersLabel = translatorFor(language)._(
    msg`${select(gender, { other: `Who follows ${name}` })}`,
  )

  return h.div(styledAttributes([], sectionsStyle, layoutStyle), [
    h.div(styledAttributes([], columnStyle), [
      ...ordered({ order: 1, children: hero({ model, language, page }, h) }, h),
      ...ordered(
        {
          order: 3,
          children: [Overview.view({ page, language }, h), ...placeMap({ page, language }, h)],
        },
        h,
      ),
      ...ordered({ order: 4, children: cultivars({ model, language, page }, h) }, h),
      ...ordered({ order: 4, children: ChildPlaces.view({ model, language, page }, h) }, h),
      ...ordered({ order: 6, children: ExternalData.editions({ model, language, page }, h) }, h),
      ...ordered({ order: 6, children: aboutContent({ page, language }, h) }, h),
      ...ordered(
        { order: 7, children: publicationsPreview({ model, language, page, maybeToday }, h) },
        h,
      ),
      ...ordered({ order: 8, children: related({ model, language }, h) }, h),
      ...ordered({ order: 9, children: photosPreview({ page, language }, h) }, h),
    ]),
    h.aside(styledAttributes([h.AriaLabel(followersLabel)], columnStyle), [
      ...ordered(
        { order: 2, children: [BookmarkPicker.view({ model, language, page, isSignedIn }, h)] },
        h,
      ),
      ...ordered(
        { order: 5, children: [bookmarkers({ model, language, page, maybeToday }, h)] },
        h,
      ),
      ...ordered(
        { order: 10, children: [contributionsPreview({ model, language, page, maybeToday }, h)] },
        h,
      ),
    ]),
  ])
}
