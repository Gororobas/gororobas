import type { PublicationKind, SupportedLanguage } from "@gororobas/domain/common/enums"
import type { ProfileCardData } from "@gororobas/domain/profiles/domain"
import type { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import type { WikiArticleKind, WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg, plural } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Equal, HashMap, Match, Option, Record } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { searchUrl } from "../../app/route"
import {
  type SearchQuery,
  SearchScope,
  type SearchType,
  peopleScope,
  publicationsScope,
  scopeOfType,
  scopeType,
  wikiScope,
} from "../../app/search-query"
import type { ClientFailure } from "../../lib/client-failure"
import type { LanguageInputs } from "../../lib/language"
import { type Translator, translatorFor } from "../../lib/translations"
import { wikiKindLabels } from "../../lib/vocabulary"
import { AppButton } from "../../ui/app-button"
import * as AppDrawer from "../../ui/app-drawer/view"
import { popoverBackdropStyle, popoverPanelStyle } from "../../ui/app-popover/styles"
import * as AppShell from "../../ui/app-shell"
import { AppText } from "../../ui/app-text"
import { Chip } from "../../ui/chip"
import { type Choice, ChoiceRow } from "../../ui/choice-row"
import { EmptyState } from "../../ui/empty-state"
import * as Icons from "../../ui/icons"
import type { IconConfig } from "../../ui/icons"
import { iconSizeProperty } from "../../ui/icons/icon-size"
import { wikiKindIcons } from "../../ui/icons/wiki-kind-icons"
import { LoadingState } from "../../ui/loading-state"
import { styledAttributes } from "../../ui/pleat-attributes"
import { ProfileRow } from "../../ui/profile-row"
import { PublicationCard } from "../../ui/publication-card"
import * as SectionHeading from "../../ui/section-heading"
import { focusRingDeclarations } from "../../ui/styles/focus-ring"
import { pageColumnStyle } from "../../ui/styles/page-column"
import {
  type ColumnCount,
  morePreviewedStyle,
  previewCapacity,
  previewItemStyle,
  resultGridContainerStyle,
  resultGridStyle,
} from "../../ui/styles/result-grid"
import { fluidResultCountFontSize } from "../../ui/theme"
import {
  type Tone,
  borderWidth,
  breakpoint,
  duration,
  easing,
  fontSize,
  fontWeight,
  layer,
  radius,
  space,
  toneColors,
  tones,
  toneStyle,
} from "../../ui/theme"
import { visuallyHiddenStyle } from "../../ui/visually-hidden"
import { WikiArticleRow } from "../../ui/wiki-article-row"
import {
  FilterPopoversBinding,
  FiltersDrawerBinding,
  SearchComposition,
  type SearchViewBuilder,
  filterPopoverId,
} from "./composition"
import {
  type FilterGroup,
  type FilterOption,
  activeSecondaryFilterCount,
  clearedSecondaryFilters,
  isBrowsing,
  isTextTooShort,
  MINIMUM_WORD_LENGTH,
  nonEmptyText,
  primaryFilterGroup,
  secondaryFilterGroups,
} from "./filters"
import { Message } from "./message"
import type { Model } from "./model"
import { articlesShownAt, profilesShownAt, publicationsShownAt } from "./preview"
import { PUBLICATIONS_SEARCH_PAGE_SIZE } from "./subscription"

/** Searches without text can match the whole encyclopedia; past this, people refine instead. */
const TYPED_ARTICLE_COUNT = 60

/** Ways into the content while nothing is typed yet, each with where it searches. */
const searchIdeas = ({
  language,
  i18n,
}: Readonly<{ language: SupportedLanguage; i18n: Translator }>): ReadonlyArray<
  Readonly<{ label: string; context: string; href: string }>
> => [
  {
    label: "Jacarandá",
    context: i18n._(msg`among plants`),
    href: searchUrl(language, {
      text: Option.some("Jacarandá"),
      scope: wikiScope(Option.some("PLANT")),
    }),
  },
  {
    label: i18n._(wikiKindLabels.BOOK.plural),
    context: i18n._(searchTypeContexts.wiki),
    href: searchUrl(language, { scope: wikiScope(Option.some("BOOK")) }),
  },
  {
    label: i18n._(msg`Organizations`),
    context: i18n._(searchTypeContexts.people),
    href: searchUrl(language, { scope: peopleScope(Option.some("ORGANIZATION")) }),
  },
  {
    label: i18n._(msg`Learnings`),
    context: i18n._(searchTypeContexts.publications),
    href: searchUrl(language, {
      text: Option.some(i18n._(msg({ message: "learnings", context: "search idea's query" }))),
      scope: publicationsScope(),
    }),
  },
  {
    label: i18n._(msg`Agroforestry`),
    context: i18n._(msg`in everything`),
    href: searchUrl(language, {
      text: Option.some(i18n._(msg({ message: "agroforestry", context: "search idea's query" }))),
    }),
  },
]

const searchTypeContexts: Readonly<Record<SearchType, MessageDescriptor>> = {
  wiki: msg`in the encyclopedia`,
  publications: msg`in publications`,
  people: msg`among people`,
}

// SHARED STYLES

const pageStyle = Style.make({
  display: "flex",
  flexDirection: "column",
  paddingBlockEnd: space[10],
})

const tabBandStyle = Style.make({
  position: "sticky",
  insetBlockStart: 0,
  zIndex: layer.sticky,
  backgroundColor: toneColors.backgroundCard,
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
})

const tabListStyle = Style.make({
  display: "flex",
  gap: space[2],
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBlock: space[3],
})

const searchInputStyle = Style.make({ paddingInlineEnd: space[9] })

const clearButtonStyle = Style.make({
  position: "absolute",
  insetBlock: 0,
  insetInlineEnd: space[1],
  marginBlock: "auto",
})

const noShrinkStyle = Style.make({ flexShrink: 0 })

const contentStyle = Style.make({ marginBlockStart: space[6] }).pipe(
  Style.when(breakpoint.md, { marginBlockStart: space[8] }),
)

const sectionsStyle = Style.make({ display: "grid", rowGap: space[9] })
const sectionStyle = Style.make({ display: "grid", rowGap: space[4], alignContent: "start" })
const typedHeaderStyle = Style.make({ display: "grid", justifyItems: "start", rowGap: space[2] })

const sectionHeaderStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
})

const summaryStyle = Style.make({ color: toneColors.foregroundMuted })
const summaryTextStyle = Style.make({
  color: toneColors.foreground,
  fontWeight: fontWeight.semibold,
})

/** Matches the choices beside it, which fill with the tone's muted step. */
const filterTriggerStyle = Style.make({
  backgroundColor: toneColors.backgroundMuted,
  borderColor: toneColors.backgroundMuted,
})

const dividerStyle = Style.make({
  flexShrink: 0,
  inlineSize: borderWidth.hairline,
  blockSize: space[6],
  backgroundColor: toneColors.border,
})

const chipWrapStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const mobileOnlyStyle = Style.make({ display: "contents" }).pipe(
  Style.when(breakpoint.md, { display: "none" }),
)
const desktopOnlyStyle = Style.make({ display: "none" }).pipe(
  Style.when(breakpoint.md, { display: "contents" }),
)

const badgeStyle = Style.make({
  display: "inline-grid",
  placeItems: "center",
  minInlineSize: "1.5em",
  blockSize: "1.5em",
  borderRadius: radius.full,
  backgroundColor: tones.secondary.ramp[600],
  color: tones.neutral.ramp[50],
  fontSize: fontSize.caption,
})

const drawerGroupsStyle = Style.make({ display: "grid", rowGap: space[5] })
const drawerGroupStyle = Style.make({ display: "grid", rowGap: space[2] })

const tileGridStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(11rem, 100%), 1fr))",
  gap: space[3],
}).pipe(Style.when(breakpoint.md, { gap: space[4] }))

const tileMarker = When.marker("browse-tile")

const tileStyle = Style.make({
  position: "relative",
  display: "block",
  minBlockSize: "7.5rem",
  containerType: "inline-size",
  overflow: "hidden",
  padding: space[4],
  borderRadius: radius.lg,
  outline: "none",
  transition: `transform ${duration.fast}`,
}).pipe(
  Style.when(When.hover, { transform: "translateY(-0.125rem)" }),
  Style.when(When.focusVisible, focusRingDeclarations),
  Style.merge(Style.mark(tileMarker)),
)

/** Shrinks with narrow tiles so long names such as "Organizações" stay whole. */
const tileTitleStyle = Style.make({
  position: "relative",
  zIndex: layer.raised,
  display: "block",
  fontSize: fluidResultCountFontSize,
  hyphens: "manual",
})

/** Tiles take turns through the palette, like a seed catalog's covers. */
const tileTones: ReadonlyArray<Exclude<Tone, "destructive">> = [
  "accent",
  "secondary",
  "primary",
  "neutral",
]

const tileToneStyle = (tone: Exclude<Tone, "destructive">) =>
  Style.make({ backgroundColor: tones[tone].ramp[300], color: tones[tone].ramp[950] })

/** Sits in the corner below the name, partly cropped by the tile, and tilts on hover. */
const tileIconStyle = Style.make({
  position: "absolute",
  insetBlockEnd: `calc(-1 * ${space[4]})`,
  insetInlineEnd: `calc(-1 * ${space[3]})`,
  transform: "rotate(-12deg)",
  transition: `transform ${duration.slow} ${easing.emphasized}`,
  [iconSizeProperty]: "5.5rem",
}).pipe(Style.when(When.within(tileMarker, When.hover), { transform: "rotate(-2deg) scale(1.06)" }))

const browseListStyle = Style.make({
  display: "grid",
  borderBlockStart: `${borderWidth.hairline} solid ${toneColors.border}`,
}).pipe(
  Style.when(breakpoint.md, {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: space[8],
  }),
)

const browseRowStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
})

const browseLinkStyle = Style.make({
  display: "grid",
  flex: 1,
  minInlineSize: 0,
  paddingBlock: space[3],
  paddingInline: space[2],
  borderRadius: radius.md,
  outline: "none",
}).pipe(
  Style.when(When.hover, { backgroundColor: toneColors.hover }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const browseContextStyle = Style.make({ color: toneColors.foregroundMuted })

// HELPERS

type ViewState = Readonly<{
  model: Model
  language: SupportedLanguage
  i18n: Translator
  query: SearchQuery
  maybeToday: Option.Option<DateTime.Utc>
}>

const searchTypeTitles: Readonly<Record<SearchType, MessageDescriptor>> = {
  wiki: msg`Encyclopedia`,
  publications: msg`Publications`,
  people: msg`People`,
}

const searchTypeIcons: Readonly<Record<SearchType, (config?: IconConfig) => Html>> = {
  wiki: Icons.encyclopedia,
  publications: Icons.clipboard,
  people: Icons.user,
}

const typeUrl = ({
  language,
  query,
  type,
}: Readonly<{
  language: SupportedLanguage
  query: SearchQuery
  type: Option.Option<SearchType>
}>) => searchUrl(language, { text: query.text, scope: scopeOfType(type) })

/** Nothing matched: suggests what usually helps. */
const noResults = (
  {
    icon,
    title,
    i18n,
  }: Readonly<{ icon: (config?: IconConfig) => Html; title: string; i18n: Translator }>,
  h: SearchViewBuilder,
): Html =>
  EmptyState.view(
    {
      icon,
      title,
      maybeDescription: Option.some(i18n._(msg`Try other words, or remove some filters.`)),
      size: "roomy",
    },
    h,
  )

const resultsView = <A>(
  {
    asyncData,
    onData,
    i18n,
    type,
  }: Readonly<{
    asyncData: AsyncData.AsyncData<A, ClientFailure>
    onData: (data: A) => Html
    i18n: Translator
    /** Its results' skeletons stand in while they load. */
    type: SearchType
  }>,
  h: SearchViewBuilder,
): Html =>
  AsyncData.matchData(asyncData, {
    onEmpty: () =>
      LoadingState.view({ label: i18n._(msg`Searching`), ...resultSkeletons(type, h) }, h),
    onFailure: () =>
      EmptyState.view(
        {
          icon: Icons.alertCircle,
          title: i18n._(msg`Couldn't search right now`),
          maybeDescription: Option.some(i18n._(msg`Try again in a moment.`)),
          size: "roomy",
        },
        h,
      ),
    onData,
  })

// CONTROLS

/** The search page's text field, which the app shell's search link focuses on arrival. */
export const SEARCH_FIELD_ID = "search-text"

const searchField = (
  { query, i18n }: Readonly<{ query: SearchQuery; i18n: Translator }>,
  h: SearchViewBuilder,
): Html =>
  h.form(
    styledAttributes(
      [h.Role("search"), h.OnSubmit(Message.SubmittedSearch({ query }))],
      AppShell.searchControlStyle,
    ),
    [
      AppText.view(
        {
          element: "label",
          attributes: styledAttributes([h.For(SEARCH_FIELD_ID)], visuallyHiddenStyle),
          children: [i18n._(msg`Search`)],
        },
        h,
      ),
      h.input(
        styledAttributes(
          [
            h.Id(SEARCH_FIELD_ID),
            h.Type("search"),
            h.Name("q"),
            h.Attribute("autocomplete", "off"),
            h.Placeholder(i18n._(msg`Search plants, publications and people`)),
            h.Value(Option.getOrElse(query.text, () => "")),
            h.OnInput((value) =>
              Message.ChangedSearchQuery({
                query: { ...query, text: value === "" ? Option.none() : Option.some(value) },
                navigation: "Replace",
              }),
            ),
          ],
          AppShell.searchSurfaceStyle,
          searchInputStyle,
        ),
      ),
      h.span(styledAttributes([h.AriaHidden(true)], AppShell.searchIconStyle), [
        Icons.search({ size: "sm" }),
      ]),
      ...EffectArray.filter(
        [
          AppButton.view(
            {
              children: [Icons.x({ size: "sm" })],
              ariaLabel: i18n._(msg`Clear search`),
              mode: "bleed",
              size: "sm",
              styles: [clearButtonStyle],
              onClick: Message.ChangedSearchQuery({
                query: { ...query, text: Option.none() },
                navigation: "Replace",
              }),
            },
            h,
          ),
        ],
        () => Option.isSome(query.text),
      ),
    ],
  )

/** The overview's type tabs. A chosen type replaces them with its own heading. */
const tabs = (
  { language, i18n, query }: Omit<ViewState, "model" | "maybeToday">,
  h: SearchViewBuilder,
): Html => {
  const entries: ReadonlyArray<readonly [string, Option.Option<SearchType>]> = [
    [i18n._(msg({ message: "All", context: "every type of content" })), Option.none()],
    [i18n._(searchTypeTitles.wiki), Option.some("wiki")],
    [i18n._(searchTypeTitles.publications), Option.some("publications")],
    [i18n._(searchTypeTitles.people), Option.some("people")],
  ]

  return h.div(styledAttributes([], tabBandStyle), [
    h.nav(
      styledAttributes([h.AriaLabel(i18n._(msg`Content type`))], pageColumnStyle, tabListStyle),
      entries.map(([label, type]) => {
        const isCurrent = Equal.equals(scopeType(query.scope), type)

        return AppButton.view(
          {
            children: [label],
            href: typeUrl({ language, query, type }),
            ariaCurrent: isCurrent ? "page" : "false",
            mode: isCurrent ? "default" : "outline",
            tone: "accent",
            size: "sm",
            styles: [noShrinkStyle],
          },
          h,
        )
      }),
    ),
  ])
}

// RESULTS

/** Restates what's being searched, since the field can sit far above the results. */
const resultSummary = (
  {
    query,
    maybeCount,
    i18n,
  }: Readonly<{ query: SearchQuery; maybeCount: Option.Option<ResultCount>; i18n: Translator }>,
  h: SearchViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(nonEmptyText(query), (text) =>
      AppText.view(
        {
          element: "p",
          attributes: styledAttributes([h.Role("status")], summaryStyle),
          children: [
            Option.match(maybeCount, {
              onNone: () => i18n._(msg`Results for`),
              onSome: ({ count, isPartial }) =>
                isPartial
                  ? i18n._(msg`${count}+ results for`)
                  : i18n._(msg`${plural(count, { one: "# result for", other: "# results for" })}`),
            }),
            " ",
            h.span(styledAttributes([], summaryTextStyle), [i18n._(msg`“${text}”`)]),
          ],
        },
        h,
      ),
    ),
  )

/** A full page of results only says there are at least that many. */
type ResultCount = Readonly<{ count: number; isPartial: boolean }>

const loadedCount = <A>(
  asyncData: AsyncData.AsyncData<ReadonlyArray<A>, ClientFailure>,
  pageSize?: number,
): Option.Option<ResultCount> =>
  Option.map(AsyncData.getData(asyncData), (items) =>
    pageSize !== undefined && items.length >= pageSize
      ? { count: pageSize, isPartial: true }
      : { count: items.length, isPartial: false },
  )

const typedCount = (model: Model, type: SearchType): Option.Option<ResultCount> =>
  Match.value(type).pipe(
    Match.when("wiki", () => loadedCount(model.wikiAsyncData)),
    Match.when("publications", () =>
      loadedCount(model.publicationsAsyncData, PUBLICATIONS_SEARCH_PAGE_SIZE),
    ),
    Match.when("people", () => loadedCount(model.profilesAsyncData)),
    Match.exhaustive,
  )

type Preview = Readonly<{ shownAt: (columns: ColumnCount) => number }>

/** Each type's results on their way, in the grid they'll fill. */
const resultSkeletons = (type: SearchType, h: SearchViewBuilder) =>
  Match.value(type).pipe(
    Match.when("wiki", () => ({
      skeleton: h.div(styledAttributes([], resultGridContainerStyle), [
        h.div(
          styledAttributes([], resultGridStyle),
          EffectArray.makeBy(6, () => WikiArticleRow.cardSkeleton(h)),
        ),
      ]),
    })),
    Match.when("publications", () => ({
      skeleton: h.div(styledAttributes([], resultGridContainerStyle), [
        h.div(
          styledAttributes([], resultGridStyle),
          EffectArray.makeBy(3, () => PublicationCard.skeleton(h)),
        ),
      ]),
    })),
    Match.when("people", () => ({ shape: "rows" as const, count: 4 })),
    Match.exhaustive,
  )

/** A grid whose columns follow its width. A preview shows whole rows only. */
const resultGrid = (
  {
    items,
    maybePreview,
  }: Readonly<{
    items: ReadonlyArray<readonly [key: string, content: Html]>
    maybePreview: Option.Option<Preview>
  }>,
  h: SearchViewBuilder,
): Html => {
  const itemStyles = EffectArray.fromOption(
    Option.map(maybePreview, ({ shownAt }) => previewItemStyle(shownAt)),
  )
  const shown = Option.match(maybePreview, {
    onNone: () => items,
    onSome: ({ shownAt }) => items.slice(0, previewCapacity(shownAt)),
  })

  return h.div(styledAttributes([], resultGridContainerStyle), [
    h.div(
      styledAttributes([], resultGridStyle),
      shown.map(([key, content]) =>
        h.keyed("div")(key, styledAttributes([], ...itemStyles), [content]),
      ),
    ),
  ])
}

const articleGrid = (
  {
    model,
    language,
    i18n,
    articles,
    maybePreview,
  }: Readonly<{
    model: Model
    language: SupportedLanguage
    i18n: Translator
    articles: ReadonlyArray<WikiArticleQueriedCardData>
    maybePreview: Option.Option<Preview>
  }>,
  h: SearchViewBuilder,
): Html =>
  EffectArray.match(articles, {
    onEmpty: () =>
      noResults({ icon: Icons.encyclopedia, title: i18n._(msg`No articles found`), i18n }, h),
    onNonEmpty: (nonEmpty) =>
      resultGrid(
        {
          maybePreview,
          items: nonEmpty.map(
            (article) =>
              [
                article.id,
                WikiArticleRow.view(
                  {
                    article,
                    language,
                    maybeBookmarkState: HashMap.get(model.viewerBookmarks, article.id),
                    isCard: true,
                  },
                  h,
                ),
              ] as const,
          ),
        },
        h,
      ),
  })

const noPublicationsFound: Readonly<Record<PublicationKind, MessageDescriptor>> = {
  POST: msg`No posts found`,
  EVENT: msg`No events found`,
}

const publicationGrid = (
  {
    language,
    i18n,
    publications,
    maybeKind,
    maybeToday,
    maybePreview,
  }: Readonly<{
    language: SupportedLanguage
    i18n: Translator
    publications: ReadonlyArray<ApiPublicationCardData>
    /** Names what's missing after the kind searched for, such as "No events found". */
    maybeKind: Option.Option<PublicationKind>
    maybeToday: Option.Option<DateTime.Utc>
    maybePreview: Option.Option<Preview>
  }>,
  h: SearchViewBuilder,
): Html =>
  EffectArray.match(publications, {
    onEmpty: () =>
      noResults(
        {
          icon: Icons.clipboard,
          title: i18n._(
            Option.match(maybeKind, {
              onNone: () => msg`No publications found`,
              onSome: (kind) => noPublicationsFound[kind],
            }),
          ),
          i18n,
        },
        h,
      ),
    onNonEmpty: (nonEmpty) =>
      resultGrid(
        {
          maybePreview,
          items: nonEmpty.map(
            (publication) =>
              [
                publication.id,
                PublicationCard.view({ language, publication, maybeToday }, h),
              ] as const,
          ),
        },
        h,
      ),
  })

const profileGrid = (
  {
    language,
    i18n,
    profiles,
    maybePreview,
  }: Readonly<{
    language: SupportedLanguage
    i18n: Translator
    profiles: ReadonlyArray<ProfileCardData>
    maybePreview: Option.Option<Preview>
  }>,
  h: SearchViewBuilder,
): Html =>
  EffectArray.match(profiles, {
    onEmpty: () => noResults({ icon: Icons.user, title: i18n._(msg`Nobody found`), i18n }, h),
    onNonEmpty: (nonEmpty) =>
      resultGrid(
        {
          maybePreview,
          items: nonEmpty.map(
            (profile) =>
              [profile.id, ProfileRow.view({ profile, language, size: "large" }, h)] as const,
          ),
        },
        h,
      ),
  })

/** Links straight into one kind of article, from the overview. */
const kindShortcuts = (
  { language, i18n, query }: Omit<ViewState, "model" | "maybeToday">,
  h: SearchViewBuilder,
): Html =>
  ChoiceRow.view(
    {
      label: i18n._(msg`Article kinds`),
      options: [
        {
          label: i18n._(msg`All`),
          isSelected: true,
          href: typeUrl({ language, query, type: Option.some("wiki") }),
        },
        ...(["PLANT", "PLANT_CULTIVAR", "CONCEPT", "BOOK", "FILM", "ANIMAL", "TOOL"] as const).map(
          (kind) => ({
            label: i18n._(wikiKindLabels[kind].plural),
            isSelected: false,
            href: searchUrl(language, { text: query.text, scope: wikiScope(Option.some(kind)) }),
          }),
        ),
      ],
    },
    h,
  )

const overviewSection = (
  {
    language,
    i18n,
    type,
    query,
    maybeLoadedCount,
    shownAt,
    children,
  }: Readonly<{
    language: SupportedLanguage
    i18n: Translator
    type: SearchType
    query: SearchQuery
    /** Unknown while loading, when the link to every result stays. */
    maybeLoadedCount: Option.Option<number>
    shownAt: (columns: ColumnCount) => number
    children: ReadonlyArray<Html>
  }>,
  h: SearchViewBuilder,
): Html =>
  h.section(
    styledAttributes(
      [h.AriaLabel(i18n._(searchTypeTitles[type]))],
      sectionStyle,
      resultGridContainerStyle,
    ),
    [
      h.div(styledAttributes([], sectionHeaderStyle), [
        SectionHeading.view(
          { title: i18n._(searchTypeTitles[type]), icon: searchTypeIcons[type] },
          h,
        ),
        // Only when there's more than the preview shows.
        ...(Option.exists(maybeLoadedCount, (count) => count === 0)
          ? []
          : [
              AppButton.view(
                {
                  children: [i18n._(msg`See all`), Icons.arrowRight({ size: "sm" })],
                  href: typeUrl({ language, query, type: Option.some(type) }),
                  tone: "accent",
                  mode: "faded",
                  size: "sm",
                  styles: EffectArray.fromOption(
                    Option.map(maybeLoadedCount, (count) => morePreviewedStyle({ shownAt, count })),
                  ),
                },
                h,
              ),
            ]),
      ]),
      ...children,
    ],
  )

const loadedLength = <A>(
  asyncData: AsyncData.AsyncData<ReadonlyArray<A>, ClientFailure>,
): Option.Option<number> => Option.map(AsyncData.getData(asyncData), (items) => items.length)

const overview = (
  { model, language, i18n, query, maybeToday }: ViewState,
  h: SearchViewBuilder,
): Html =>
  h.div(styledAttributes([], sectionsStyle), [
    ...resultSummary({ query, maybeCount: Option.none(), i18n }, h),
    overviewSection(
      {
        language,
        i18n,
        type: "wiki",
        query,
        maybeLoadedCount: loadedLength(model.wikiAsyncData),
        shownAt: articlesShownAt,
        children: [
          kindShortcuts({ language, i18n, query }, h),
          resultsView(
            {
              asyncData: model.wikiAsyncData,
              i18n,
              type: "wiki",
              onData: (articles) =>
                articleGrid(
                  {
                    model,
                    language,
                    i18n,
                    articles,
                    maybePreview: Option.some({ shownAt: articlesShownAt }),
                  },
                  h,
                ),
            },
            h,
          ),
        ],
      },
      h,
    ),
    overviewSection(
      {
        language,
        i18n,
        type: "publications",
        query,
        maybeLoadedCount: loadedLength(model.publicationsAsyncData),
        shownAt: publicationsShownAt,
        children: [
          resultsView(
            {
              asyncData: model.publicationsAsyncData,
              i18n,
              type: "publications",
              onData: (publications) =>
                publicationGrid(
                  {
                    language,
                    i18n,
                    publications,
                    maybeKind: Option.none(),
                    maybeToday,
                    maybePreview: Option.some({ shownAt: publicationsShownAt }),
                  },
                  h,
                ),
            },
            h,
          ),
        ],
      },
      h,
    ),
    overviewSection(
      {
        language,
        i18n,
        type: "people",
        query,
        maybeLoadedCount: loadedLength(model.profilesAsyncData),
        shownAt: profilesShownAt,
        children: [
          resultsView(
            {
              asyncData: model.profilesAsyncData,
              i18n,
              type: "people",
              onData: (profiles) =>
                profileGrid(
                  {
                    language,
                    i18n,
                    profiles,
                    maybePreview: Option.some({ shownAt: profilesShownAt }),
                  },
                  h,
                ),
            },
            h,
          ),
        ],
      },
      h,
    ),
  ])

// BROWSING

const tile = (
  {
    label,
    href,
    icon,
    tone,
  }: Readonly<{
    label: string
    href: string
    icon: (config?: IconConfig) => Html
    tone: Exclude<Tone, "destructive">
  }>,
  h: SearchViewBuilder,
): Html =>
  h.a(styledAttributes([h.Href(href)], tileStyle, tileToneStyle(tone)), [
    AppText.view(
      {
        element: "span",
        weight: "semibold",
        lineHeight: "tight",
        styles: [tileTitleStyle],
        children: [label],
      },
      h,
    ),
    h.span(
      styledAttributes(
        [h.AriaHidden(true)],
        tileIconStyle,
        Style.make({ color: tones[tone].ramp[700] }),
      ),
      [icon({ mode: "duotone", size: "lg" })],
    ),
  ])

/** Nothing typed yet: ways in, like a catalog's sections, and searches to try. */
const browseLink = (
  { label, context, href }: Readonly<{ label: string; context: string; href: string }>,
  h: SearchViewBuilder,
): Html =>
  h.a(styledAttributes([h.Href(href)], browseLinkStyle), [
    AppText.view(
      {
        element: "span",
        appearance: "large",
        weight: "semibold",
        lineHeight: "tight",
        children: [label],
      },
      h,
    ),
    AppText.view(
      {
        element: "span",
        appearance: "footnote",
        styles: [browseContextStyle],
        children: [context],
      },
      h,
    ),
  ])

const browse = (
  {
    model,
    language,
    i18n,
  }: Readonly<{ model: Model; language: SupportedLanguage; i18n: Translator }>,
  h: SearchViewBuilder,
): Html => {
  const wikiTile = (kind: WikiArticleKind) => ({
    label: i18n._(wikiKindLabels[kind].plural),
    href: searchUrl(language, { scope: wikiScope(Option.some(kind)) }),
    icon: wikiKindIcons[kind],
  })

  // What people come to Gororobas for first; the encyclopedia's other kinds follow.
  const leadingWikiKinds: ReadonlyArray<WikiArticleKind> = ["NOTEWORTHY_ENTITY", "PLANT"]

  const tiles = [
    {
      label: i18n._(searchTypeTitles.publications),
      href: searchUrl(language, { scope: publicationsScope() }),
      icon: Icons.clipboard,
    },
    {
      label: i18n._(searchTypeTitles.people),
      href: searchUrl(language, { scope: peopleScope() }),
      icon: Icons.users,
    },
    ...leadingWikiKinds.map(wikiTile),
    ...Record.keys(wikiKindIcons)
      .filter((kind) => kind !== "UNCATEGORIZED" && !leadingWikiKinds.includes(kind))
      .map(wikiTile),
  ]

  const browseTitle = i18n._(msg`Browse everything`)
  const recentTitle = i18n._(msg`Recent searches`)
  const ideasTitle = i18n._(msg`Search ideas`)

  return h.div(styledAttributes([], sectionsStyle), [
    h.section(styledAttributes([h.AriaLabel(browseTitle)], sectionStyle), [
      SectionHeading.view({ title: browseTitle, icon: Icons.layers }, h),
      h.div(
        styledAttributes([], tileGridStyle),
        tiles.map((entry, index) =>
          h.keyed("div")(
            entry.href,
            [],
            [tile({ ...entry, tone: tileTones[index % tileTones.length] ?? "accent" }, h)],
          ),
        ),
      ),
    ]),
    ...EffectArray.match(model.recentSearches, {
      onEmpty: () => [],
      onNonEmpty: (recentSearches) => [
        h.section(styledAttributes([h.AriaLabel(recentTitle)], sectionStyle), [
          SectionHeading.view({ title: recentTitle, icon: Icons.history }, h),
          h.ul(
            styledAttributes([], browseListStyle),
            recentSearches.map((recent, index) =>
              h.keyed("li")(
                `${recent.text}-${Option.getOrElse(recent.type, () => "all")}`,
                styledAttributes([], browseRowStyle),
                [
                  browseLink(
                    {
                      label: recent.text,
                      context: Option.match(recent.type, {
                        onNone: () => i18n._(msg`in everything`),
                        onSome: (type) => i18n._(searchTypeContexts[type]),
                      }),
                      href: searchUrl(language, {
                        text: Option.some(recent.text),
                        scope: scopeOfType(recent.type),
                      }),
                    },
                    h,
                  ),
                  AppButton.view(
                    {
                      children: [Icons.x({ size: "sm" })],
                      ariaLabel: i18n._(msg`Remove ${recent.text} from recent searches`),
                      onClick: Message.ClickedRemoveRecentSearch({ index }),
                      mode: "bleed",
                      size: "sm",
                    },
                    h,
                  ),
                ],
              ),
            ),
          ),
        ]),
      ],
    }),
    h.section(styledAttributes([h.AriaLabel(ideasTitle)], sectionStyle), [
      SectionHeading.view({ title: ideasTitle, icon: Icons.lightbulb }, h),
      h.ul(
        styledAttributes([], browseListStyle),
        searchIdeas({ language, i18n }).map((idea) =>
          h.keyed("li")(idea.href, styledAttributes([], browseRowStyle), [browseLink(idea, h)]),
        ),
      ),
    ]),
  ])
}

// FILTERS

const filterOptions = (group: FilterGroup, h: SearchViewBuilder): Html =>
  h.div(
    styledAttributes([h.Role("group"), h.AriaLabel(group.label)], chipWrapStyle),
    group.options.map((option) =>
      h.keyed("span")(
        option.label,
        [],
        [
          Chip.view(
            {
              label: option.label,
              appearance: option.isSelected ? "selectedOption" : "option",
              isPressed: option.isSelected,
              onClick: Message.ChangedSearchQuery({
                query: option.toggledQuery,
                navigation: "Push",
              }),
            },
            h,
          ),
        ],
      ),
    ),
  )

const countBadge = (count: number, h: SearchViewBuilder): ReadonlyArray<Html> =>
  count > 0 ? [h.span(styledAttributes([], badgeStyle), [String(count)])] : []

const filterPopover = (
  { model, group }: Readonly<{ model: Model; group: FilterGroup }>,
  h: SearchViewBuilder,
): Html =>
  Option.match(
    EffectArray.findFirst(
      model.filterPopovers,
      (popover) => popover.id === filterPopoverId(group.id),
    ),
    {
      onNone: () => h.empty,
      onSome: (popover) =>
        h.block(
          FilterPopoversBinding.embedView({
            key: popover.id,
            slotId: popover.id,
            model: popover,
            viewInputs: {
              anchor: { placement: "bottom-start", gap: 6, padding: 8 },
              ariaLabel: group.label,
              toView: ({ button, panel, backdrop, isVisible }) =>
                h.div(
                  [],
                  [
                    AppButton.view(
                      {
                        attributes: button,
                        tone: group.selectedCount > 0 ? "primary" : "neutral",
                        mode: "faded",
                        size: "sm",
                        styles: [filterTriggerStyle],
                        children: [
                          group.label,
                          ...countBadge(group.selectedCount, h),
                          Icons.chevronDown({ size: "sm" }),
                        ],
                      },
                      h,
                    ),
                    ...(isVisible
                      ? [
                          h.div(styledAttributes(backdrop, popoverBackdropStyle)),
                          h.div(styledAttributes(panel, popoverPanelStyle, toneStyle("accent")), [
                            filterOptions(group, h),
                          ]),
                        ]
                      : []),
                  ],
                ),
            },
          }),
        ),
    },
  )

/** The type's first choice, "All" first: an article's kind, a post's format, a profile's type. */
const primaryChoices = ({
  query,
  primary,
  i18n,
}: Readonly<{ query: SearchQuery; primary: FilterGroup; i18n: Translator }>): ReadonlyArray<
  Choice<Parameters<SearchViewBuilder["OnClick"]>[0]>
> => {
  const maybeSelected = EffectArray.findFirst(primary.options, (option) => option.isSelected)
  const choose = (option: FilterOption) =>
    Message.ChangedSearchQuery({ query: option.toggledQuery, navigation: "Push" })

  return [
    {
      label: i18n._(msg`All`),
      isSelected: Option.isNone(maybeSelected),
      onClick: Option.match(maybeSelected, {
        onNone: () => Message.ChangedSearchQuery({ query, navigation: "Replace" }),
        onSome: choose,
      }),
    },
    ...primary.options.map((option) => ({
      label: option.label,
      isSelected: option.isSelected,
      // Choosing the current option again keeps it; "All" is how to undo it.
      onClick: option.isSelected
        ? Message.ChangedSearchQuery({ query, navigation: "Replace" })
        : choose(option),
    })),
  ]
}

/**
 * The type's first choice, then the filters it opens: popovers on wide screens, a drawer of
 * every filter on small ones.
 */
const filterBar = (
  { model, query, i18n }: Omit<ViewState, "maybeToday">,
  h: SearchViewBuilder,
): Html =>
  Option.match(primaryFilterGroup({ query, i18n }), {
    onNone: () => h.empty,
    onSome: (primary) => {
      const secondary = secondaryFilterGroups({ query, i18n })
      const secondaryCount = activeSecondaryFilterCount({ query, i18n })

      const maybeSelected = EffectArray.findFirst(primary.options, (option) => option.isSelected)
      // Article kinds are many: once one is chosen it stands alone, with a way to undo it.
      const isCollapsed = Option.isSome(maybeSelected) && primary.options.length > 3

      return ChoiceRow.view(
        {
          label: primary.label,
          options: isCollapsed
            ? primaryChoices({ query, primary, i18n }).filter((choice) => choice.isSelected)
            : primaryChoices({ query, primary, i18n }),
          leading: EffectArray.fromOption(
            Option.map(
              Option.filter(maybeSelected, () => isCollapsed),
              (selected) =>
                AppButton.view(
                  {
                    children: [Icons.x({ size: "sm" })],
                    ariaLabel: i18n._(msg`Remove filter ${selected.label}`),
                    onClick: Message.ChangedSearchQuery({
                      query: selected.toggledQuery,
                      navigation: "Push",
                    }),
                    tone: "neutral",
                    mode: "faded",
                    size: "sm",
                    styles: [noShrinkStyle, filterTriggerStyle],
                  },
                  h,
                ),
            ),
          ),
          trailing: [
            ...(EffectArray.isReadonlyArrayNonEmpty(secondary)
              ? [
                  h.span(styledAttributes([h.AriaHidden(true)], dividerStyle)),
                  h.div(styledAttributes([], mobileOnlyStyle), [
                    AppButton.view(
                      {
                        children: [
                          Icons.filter({ size: "sm" }),
                          i18n._(msg`All filters`),
                          ...countBadge(secondaryCount, h),
                        ],
                        onClick: Message.ClickedOpenFilters(),
                        tone: secondaryCount > 0 ? "primary" : "neutral",
                        mode: "faded",
                        size: "sm",
                        styles: [noShrinkStyle, filterTriggerStyle],
                      },
                      h,
                    ),
                  ]),
                  h.div(
                    styledAttributes([], desktopOnlyStyle),
                    secondary.map((group) => filterPopover({ model, group }, h)),
                  ),
                ]
              : []),
            ...(secondaryCount > 0
              ? [
                  AppButton.view(
                    {
                      children: [i18n._(msg`Clear filters`)],
                      onClick: Message.ChangedSearchQuery({
                        query: clearedSecondaryFilters(query),
                        navigation: "Push",
                      }),
                      tone: "accent",
                      mode: "bleed",
                      size: "sm",
                      styles: [noShrinkStyle],
                    },
                    h,
                  ),
                ]
              : []),
          ],
        },
        h,
      )
    },
  })

const filtersDrawer = (
  { model, query, i18n }: Omit<ViewState, "maybeToday">,
  h: SearchViewBuilder,
): Html =>
  h.block(
    FiltersDrawerBinding.embedView({
      slotId: "search-filters",
      model: model.filtersDrawer,
      viewInputs: {
        toView: (render, drawerBuilder) =>
          AppDrawer.view(
            {
              render,
              title: i18n._(msg`All filters`),
              size: "form",
              tone: "accent",
              isSectioned: true,
              children: [
                h.div(
                  styledAttributes([], drawerGroupsStyle),
                  secondaryFilterGroups({ query, i18n }).map((group) =>
                    h.keyed("section")(group.id, styledAttributes([], drawerGroupStyle), [
                      AppText.view(
                        {
                          element: "h3",
                          appearance: "regular",
                          weight: "semibold",
                          children: [group.label],
                        },
                        h,
                      ),
                      filterOptions(group, h),
                    ]),
                  ),
                ),
              ],
              headerActions: [
                AppButton.view(
                  {
                    mode: "outline",
                    tone: "accent",
                    size: "sm",
                    isDisabled: activeSecondaryFilterCount({ query, i18n }) === 0,
                    onClick: Message.ChangedSearchQuery({
                      query: clearedSecondaryFilters(query),
                      navigation: "Push",
                    }),
                    ariaLabel: i18n._(msg`Clear filters`),
                    title: i18n._(msg`Clear filters`),
                    children: [Icons.trash({ size: "sm" })],
                  },
                  h,
                ),
                AppButton.view(
                  {
                    tone: "accent",
                    size: "sm",
                    onClick: Message.ClickedCloseFilters(),
                    children: [i18n._(msg`See results`)],
                  },
                  h,
                ),
              ],
            },
            drawerBuilder,
          ),
      },
    }),
  )

/** One type's results: a way back to every type, its heading and its filters. */
const typedResults = (
  { model, language, i18n, query, maybeToday, type }: ViewState & Readonly<{ type: SearchType }>,
  h: SearchViewBuilder,
): Html =>
  h.div(
    [],
    [
      h.section(styledAttributes([h.AriaLabel(i18n._(searchTypeTitles[type]))], sectionStyle), [
        h.div(styledAttributes([], typedHeaderStyle), [
          AppButton.view(
            {
              children: [Icons.arrowLeft({ size: "sm" }), i18n._(msg`All types`)],
              href: typeUrl({ language, query, type: Option.none() }),
              tone: "accent",
              mode: "bleed",
              size: "sm",
            },
            h,
          ),
          SectionHeading.view(
            { title: i18n._(searchTypeTitles[type]), icon: searchTypeIcons[type], element: "h1" },
            h,
          ),
          ...resultSummary({ query, maybeCount: typedCount(model, type), i18n }, h),
        ]),
        filterBar({ model, language, i18n, query }, h),
        Match.value(type).pipe(
          Match.withReturnType<Html>(),
          Match.when("wiki", () =>
            resultsView(
              {
                asyncData: model.wikiAsyncData,
                i18n,
                type: "wiki",
                onData: (articles) =>
                  articleGrid(
                    {
                      model,
                      language,
                      i18n,
                      articles: articles.slice(0, TYPED_ARTICLE_COUNT),
                      maybePreview: Option.none(),
                    },
                    h,
                  ),
              },
              h,
            ),
          ),
          Match.when("publications", () =>
            resultsView(
              {
                asyncData: model.publicationsAsyncData,
                i18n,
                type: "publications",
                onData: (publications) =>
                  publicationGrid(
                    {
                      language,
                      i18n,
                      publications,
                      maybeKind: SearchScope.guards.Publications(query.scope)
                        ? query.scope.maybeKind
                        : Option.none(),
                      maybeToday,
                      maybePreview: Option.none(),
                    },
                    h,
                  ),
              },
              h,
            ),
          ),
          Match.when("people", () =>
            resultsView(
              {
                asyncData: model.profilesAsyncData,
                i18n,
                type: "people",
                onData: (profiles) =>
                  profileGrid({ language, i18n, profiles, maybePreview: Option.none() }, h),
              },
              h,
            ),
          ),
          Match.exhaustive,
        ),
      ]),
      filtersDrawer({ model, language, i18n, query }, h),
    ],
  )

export type ViewInputs = LanguageInputs &
  Readonly<{
    query: SearchQuery
    maybeToday: Option.Option<DateTime.Utc>
    /** Places the search field in the app bar, where the search link sits on other pages. */
    renderHeader: (search: Html) => Html
  }>

export const view = SearchComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language, query, maybeToday, renderHeader }, h): Html => {
    const i18n = translatorFor(language)
    const maybeType = scopeType(query.scope)

    return h.div(styledAttributes([], pageStyle), [
      renderHeader(searchField({ query, i18n }, h)),
      ...(Option.isNone(maybeType) && !isBrowsing(query) && !isTextTooShort(query)
        ? [tabs({ language, i18n, query }, h)]
        : []),
      h.div(styledAttributes([], pageColumnStyle, contentStyle), [
        isBrowsing(query)
          ? browse({ model, language, i18n }, h)
          : isTextTooShort(query)
            ? h.div(
                [],
                [
                  AppText.view(
                    {
                      element: "p",
                      attributes: styledAttributes([h.Role("status")], summaryStyle),
                      children: [
                        i18n._(msg`Type at least ${MINIMUM_WORD_LENGTH} letters to search.`),
                      ],
                    },
                    h,
                  ),
                  browse({ model, language, i18n }, h),
                ],
              )
            : Option.match(maybeType, {
                onNone: () => overview({ model, language, i18n, query, maybeToday }, h),
                onSome: (type) =>
                  typedResults({ model, language, i18n, query, maybeToday, type }, h),
              }),
      ]),
    ])
  },
)
