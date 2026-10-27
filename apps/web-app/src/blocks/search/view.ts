import type { ProfileCardData } from "@gororobas/domain/profiles/domain"
import type { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Equal, HashMap, Match, Option, Record } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type SearchQuery, type SearchType, searchUrl } from "../../app/route"
import { wikiKindLabels } from "../../lib/vocabulary"
import { AppButton } from "../../ui/app-button"
import * as AppDrawer from "../../ui/app-drawer/view"
import * as AppShell from "../../ui/app-shell"
import { AppText } from "../../ui/app-text"
import { Chip } from "../../ui/chip"
import { FilterPill } from "../../ui/filter-pill"
import * as Icons from "../../ui/icons"
import type { IconConfig } from "../../ui/icons"
import { iconSizeProperty } from "../../ui/icons/icon-size"
import { wikiKindIcons } from "../../ui/icons/wiki-kind-icons"
import { styledAttributes } from "../../ui/pleat-attributes"
import { ProfileRow } from "../../ui/profile-row"
import { PublicationCard } from "../../ui/publication-card"
import * as SectionHeading from "../../ui/section-heading"
import { SegmentedControl } from "../../ui/segmented-control"
import { focusRingDeclarations } from "../../ui/styles/focus-ring"
import { pageColumnStyle } from "../../ui/styles/page-column"
import {
  type ColumnCount,
  previewCapacity,
  previewItemStyle,
  resultGridContainerStyle,
  resultGridStyle,
} from "../../ui/styles/result-grid"
import { emptyStateStyle } from "../../ui/styles/surfaces"
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
  nonEmptyText,
  primaryFilterGroup,
  secondaryFilterGroups,
} from "./filters"
import { Message } from "./message"
import type { Model } from "./model"
import { articlesShownAt, profilesShownAt, publicationsShownAt } from "./preview"
import { PUBLICATION_PAGE_SIZE } from "./subscription"

/** Searches without text can match the whole encyclopedia; past this, people refine instead. */
const TYPED_ARTICLE_COUNT = 60

/** Ways into the content while nothing is typed yet, each with where it searches. */
const SEARCH_IDEAS: ReadonlyArray<Readonly<{ label: string; context: string; href: string }>> = [
  {
    label: "Jacarandá",
    context: "entre as plantas",
    href: searchUrl({
      text: Option.some("Jacarandá"),
      type: Option.some("wiki"),
      wikiKind: Option.some("PLANT"),
    }),
  },
  {
    label: "Livros",
    context: "na enciclopédia",
    href: searchUrl({ type: Option.some("wiki"), wikiKind: Option.some("BOOK") }),
  },
  {
    label: "Organizações",
    context: "entre a gente",
    href: searchUrl({ type: Option.some("people"), profileType: Option.some("ORGANIZATION") }),
  },
  {
    label: "Aprendizados",
    context: "nos posts",
    href: searchUrl({ text: Option.some("aprendizados"), type: Option.some("publications") }),
  },
  {
    label: "Agrofloresta",
    context: "em tudo",
    href: searchUrl({ text: Option.some("agrofloresta") }),
  },
]

const searchTypeContexts: Readonly<Record<SearchType, string>> = {
  wiki: "na enciclopédia",
  publications: "nos posts",
  people: "entre a gente",
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

/** Scrolls sideways on small screens; wraps on wide ones, where filter popovers open in place. */
const buttonRowStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBlock: space[1],
  marginInline: `calc(-1 * ${space[4]})`,
  paddingInline: space[4],
}).pipe(
  Style.when(breakpoint.sm, { marginInline: `calc(-1 * ${space[6]})`, paddingInline: space[6] }),
  Style.when(breakpoint.md, {
    flexWrap: "wrap",
    overflowX: "visible",
    marginInline: 0,
    paddingInline: 0,
  }),
)

const tabListStyle = Style.make({
  display: "flex",
  gap: space[2],
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBlock: space[3],
})

const searchInputStyle = Style.make({ paddingInlineEnd: space[9], border: 0 })

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

const loadingStyle = Style.make({
  paddingBlock: space[6],
  color: toneColors.foregroundMuted,
  fontSize: fontSize.footnote,
})

const summaryStyle = Style.make({ color: toneColors.foregroundMuted })
const summaryTextStyle = Style.make({
  color: toneColors.foreground,
  fontWeight: fontWeight.semibold,
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

const popoverPanelStyle = Style.make({
  zIndex: layer.overlay,
  display: "grid",
  rowGap: space[3],
  inlineSize: "min(22rem, calc(100vw - 2rem))",
  padding: space[4],
  border: `${borderWidth.hairline} solid ${toneColors.border}`,
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
  boxShadow: "0 12px 32px rgb(0 0 0 / 12%)",
  outline: "none",
})

const popoverBackdropStyle = Style.make({ position: "fixed", inset: 0, zIndex: layer.raised })
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
  zIndex: 1,
  display: "block",
  fontSize: `clamp(${fontSize.regular}, 11cqi, ${fontSize.large})`,
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
  query: SearchQuery
  maybeToday: Option.Option<DateTime.Utc>
}>

const searchTypeTitles: Readonly<Record<SearchType, string>> = {
  wiki: "Enciclopédia",
  publications: "Posts",
  people: "Gente",
}

const searchTypeIcons: Readonly<Record<SearchType, (config?: IconConfig) => Html>> = {
  wiki: Icons.encyclopedia,
  publications: Icons.clipboard,
  people: Icons.user,
}

const typeUrl = (query: SearchQuery, type: Option.Option<SearchType>) =>
  searchUrl({ text: query.text, type })

const emptyState = (text: string, h: SearchViewBuilder): Html =>
  h.p(styledAttributes([], emptyStateStyle({ size: "compact" })), [text])

const resultsView = <A>(
  {
    asyncData,
    onData,
  }: Readonly<{ asyncData: AsyncData.AsyncData<A, string>; onData: (data: A) => Html }>,
  h: SearchViewBuilder,
): Html =>
  AsyncData.matchData(asyncData, {
    onEmpty: () => h.p(styledAttributes([h.Role("status")], loadingStyle), ["Buscando…"]),
    onFailure: () => emptyState("Não foi possível buscar agora. Tente novamente em instantes.", h),
    onData,
  })

// CONTROLS

const searchField = (query: SearchQuery, h: SearchViewBuilder): Html =>
  h.form(
    styledAttributes(
      [h.Role("search"), h.OnSubmit(Message.SubmittedSearch({ query }))],
      AppShell.searchControlStyle,
    ),
    [
      h.label(styledAttributes([h.For("search-text")], visuallyHiddenStyle), ["Buscar"]),
      h.input(
        styledAttributes(
          [
            h.Id("search-text"),
            h.Type("search"),
            h.Name("q"),
            h.Attribute("autocomplete", "off"),
            h.Placeholder("Buscar plantas, posts e pessoas"),
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
        Icons.search({ mode: "filled", tone: "secondary" }),
      ]),
      ...EffectArray.filter(
        [
          AppButton.view(
            {
              children: [Icons.x({ size: "sm" })],
              ariaLabel: "Limpar busca",
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
const tabs = (query: SearchQuery, h: SearchViewBuilder): Html => {
  const entries: ReadonlyArray<readonly [string, Option.Option<SearchType>]> = [
    ["Tudo", Option.none()],
    ["Enciclopédia", Option.some("wiki")],
    ["Posts", Option.some("publications")],
    ["Gente", Option.some("people")],
  ]

  return h.div(styledAttributes([], tabBandStyle), [
    h.nav(
      styledAttributes([h.AriaLabel("Tipo de conteúdo")], pageColumnStyle, tabListStyle),
      entries.map(([label, type]) => {
        const isCurrent = Equal.equals(query.type, type)

        return AppButton.view(
          {
            children: [label],
            href: typeUrl(query, type),
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
  { query, maybeCount }: Readonly<{ query: SearchQuery; maybeCount: Option.Option<string> }>,
  h: SearchViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(nonEmptyText(query), (text) =>
      h.p(styledAttributes([h.Role("status")], summaryStyle), [
        Option.match(maybeCount, {
          onNone: () => "Resultados para ",
          onSome: (count) => `${count} ${count === "1" ? "resultado" : "resultados"} para `,
        }),
        h.span(styledAttributes([], summaryTextStyle), [`“${text}”`]),
      ]),
    ),
  )

const loadedCount = <A>(
  asyncData: AsyncData.AsyncData<ReadonlyArray<A>, string>,
  pageSize?: number,
): Option.Option<string> =>
  Option.map(AsyncData.getData(asyncData), (items) =>
    pageSize !== undefined && items.length >= pageSize ? `${pageSize}+` : String(items.length),
  )

const typedCount = (model: Model, type: SearchType): Option.Option<string> =>
  Match.value(type).pipe(
    Match.when("wiki", () => loadedCount(model.wikiAsyncData)),
    Match.when("publications", () =>
      loadedCount(model.publicationsAsyncData, PUBLICATION_PAGE_SIZE),
    ),
    Match.when("people", () => loadedCount(model.profilesAsyncData)),
    Match.exhaustive,
  )

type Preview = Readonly<{ shownAt: (columns: ColumnCount) => number }>

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
    articles,
    maybePreview,
  }: Readonly<{
    model: Model
    articles: ReadonlyArray<WikiArticleQueriedCardData>
    maybePreview: Option.Option<Preview>
  }>,
  h: SearchViewBuilder,
): Html =>
  EffectArray.match(articles, {
    onEmpty: () => emptyState("Nenhum artigo encontrado.", h),
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

const publicationGrid = (
  {
    publications,
    maybeToday,
    maybePreview,
  }: Readonly<{
    publications: ReadonlyArray<ApiPublicationCardData>
    maybeToday: Option.Option<DateTime.Utc>
    maybePreview: Option.Option<Preview>
  }>,
  h: SearchViewBuilder,
): Html =>
  EffectArray.match(publications, {
    onEmpty: () => emptyState("Nenhum post encontrado.", h),
    onNonEmpty: (nonEmpty) =>
      resultGrid(
        {
          maybePreview,
          items: nonEmpty.map(
            (publication) =>
              [publication.id, PublicationCard.view({ publication, maybeToday }, h)] as const,
          ),
        },
        h,
      ),
  })

const profileGrid = (
  {
    profiles,
    maybePreview,
  }: Readonly<{
    profiles: ReadonlyArray<ProfileCardData>
    maybePreview: Option.Option<Preview>
  }>,
  h: SearchViewBuilder,
): Html =>
  EffectArray.match(profiles, {
    onEmpty: () => emptyState("Ninguém encontrado.", h),
    onNonEmpty: (nonEmpty) =>
      resultGrid(
        {
          maybePreview,
          items: nonEmpty.map(
            (profile) => [profile.id, ProfileRow.view({ profile, size: "large" }, h)] as const,
          ),
        },
        h,
      ),
  })

/** Links straight into one kind of article, from the overview. */
const kindShortcuts = (query: SearchQuery, h: SearchViewBuilder): Html =>
  h.div(
    styledAttributes([h.AriaLabel("Tipos de artigo")], buttonRowStyle),
    (["PLANT", "PLANT_CULTIVAR", "CONCEPT", "BOOK", "FILM", "ANIMAL", "TOOL"] as const).map(
      (kind) =>
        AppButton.view(
          {
            children: [wikiKindLabels[kind].plural],
            href: searchUrl({
              text: query.text,
              type: Option.some("wiki"),
              wikiKind: Option.some(kind),
            }),
            tone: "accent",
            mode: "outline",
            size: "sm",
            styles: [noShrinkStyle],
          },
          h,
        ),
    ),
  )

const overviewSection = (
  {
    type,
    query,
    children,
  }: Readonly<{ type: SearchType; query: SearchQuery; children: ReadonlyArray<Html> }>,
  h: SearchViewBuilder,
): Html =>
  h.section(styledAttributes([h.AriaLabel(searchTypeTitles[type])], sectionStyle), [
    h.div(styledAttributes([], sectionHeaderStyle), [
      SectionHeading.view({ title: searchTypeTitles[type], icon: searchTypeIcons[type] }, h),
      AppButton.view(
        {
          children: ["Ver todos", Icons.arrowRight({ size: "sm" })],
          href: typeUrl(query, Option.some(type)),
          tone: "accent",
          mode: "faded",
          size: "sm",
        },
        h,
      ),
    ]),
    ...children,
  ])

const overview = ({ model, query, maybeToday }: ViewState, h: SearchViewBuilder): Html =>
  h.div(styledAttributes([], sectionsStyle), [
    ...resultSummary({ query, maybeCount: Option.none() }, h),
    overviewSection(
      {
        type: "wiki",
        query,
        children: [
          kindShortcuts(query, h),
          resultsView(
            {
              asyncData: model.wikiAsyncData,
              onData: (articles) =>
                articleGrid(
                  { model, articles, maybePreview: Option.some({ shownAt: articlesShownAt }) },
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
        type: "publications",
        query,
        children: [
          resultsView(
            {
              asyncData: model.publicationsAsyncData,
              onData: (publications) =>
                publicationGrid(
                  {
                    publications,
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
        type: "people",
        query,
        children: [
          resultsView(
            {
              asyncData: model.profilesAsyncData,
              onData: (profiles) =>
                profileGrid(
                  { profiles, maybePreview: Option.some({ shownAt: profilesShownAt }) },
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

const browse = (model: Model, h: SearchViewBuilder): Html => {
  const tiles = [
    ...Record.toEntries(wikiKindIcons)
      .filter(([kind]) => kind !== "UNCATEGORIZED")
      .map(([kind, icon]) => ({
        label: wikiKindLabels[kind].plural,
        href: searchUrl({ type: Option.some("wiki"), wikiKind: Option.some(kind) }),
        icon,
      })),
    {
      label: searchTypeTitles.publications,
      href: searchUrl({ type: Option.some("publications") }),
      icon: Icons.clipboard,
    },
    {
      label: searchTypeTitles.people,
      href: searchUrl({ type: Option.some("people") }),
      icon: Icons.users,
    },
  ]

  return h.div(styledAttributes([], sectionsStyle), [
    h.section(styledAttributes([h.AriaLabel("Navegue por tudo")], sectionStyle), [
      SectionHeading.view({ title: "Navegue por tudo", icon: Icons.layers }, h),
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
        h.section(styledAttributes([h.AriaLabel("Buscas recentes")], sectionStyle), [
          SectionHeading.view({ title: "Buscas recentes", icon: Icons.history }, h),
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
                        onNone: () => "em tudo",
                        onSome: (type) => searchTypeContexts[type],
                      }),
                      href: searchUrl({ text: Option.some(recent.text), type: recent.type }),
                    },
                    h,
                  ),
                  AppButton.view(
                    {
                      children: [Icons.x({ size: "sm" })],
                      ariaLabel: `Remover ${recent.text} das buscas recentes`,
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
    h.section(styledAttributes([h.AriaLabel("Ideias de buscas")], sectionStyle), [
      SectionHeading.view({ title: "Ideias de buscas", icon: Icons.lightbulb }, h),
      h.ul(
        styledAttributes([], browseListStyle),
        SEARCH_IDEAS.map((idea) =>
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
                    FilterPill.view(
                      {
                        attributes: button,
                        appearance: group.selectedCount > 0 ? "active" : "idle",
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

/** Picks the type's first choice: the article kind, or between a couple of formats. */
const primaryChoice = (
  { query, primary }: Readonly<{ query: SearchQuery; primary: FilterGroup }>,
  h: SearchViewBuilder,
): ReadonlyArray<Html> => {
  const maybeSelected = EffectArray.findFirst(primary.options, (option) => option.isSelected)
  const choose = (option: FilterOption) =>
    Message.ChangedSearchQuery({ query: option.toggledQuery, navigation: "Push" })

  // A couple of choices read best as a switch, with "Todos" undoing the choice.
  if (primary.options.length <= 3) {
    return [
      SegmentedControl.view(
        {
          label: primary.label,
          segments: [
            {
              label: "Todos",
              isSelected: Option.isNone(maybeSelected),
              onClick: Option.match(maybeSelected, {
                onNone: () => Message.ChangedSearchQuery({ query, navigation: "Replace" }),
                onSome: choose,
              }),
            },
            ...primary.options.map((option) => ({
              label: option.label,
              isSelected: option.isSelected,
              onClick: choose(option),
            })),
          ],
        },
        h,
      ),
    ]
  }

  // Many choices are pills; once one is chosen it stands alone, and pressing it undoes it.
  return Option.match(maybeSelected, {
    onNone: () =>
      primary.options.map((option) =>
        FilterPill.view({ children: [option.label], onClick: choose(option) }, h),
      ),
    onSome: (selected) => [
      FilterPill.view(
        {
          appearance: "selected",
          onClick: choose(selected),
          attributes: [h.AriaPressed("true"), h.AriaLabel(`${selected.label}: remover filtro`)],
          children: [selected.label, Icons.x({ size: "sm" })],
        },
        h,
      ),
    ],
  })
}

/**
 * The type's first choice, then the filters it opens: popovers on wide screens, a drawer of
 * every filter on small ones.
 */
const filterBar = ({ model, query }: Omit<ViewState, "maybeToday">, h: SearchViewBuilder): Html =>
  Option.match(primaryFilterGroup(query), {
    onNone: () => h.empty,
    onSome: (primary) => {
      const secondary = secondaryFilterGroups(query)
      const secondaryCount = activeSecondaryFilterCount(query)

      return h.div(styledAttributes([h.Role("group"), h.AriaLabel("Filtros")], buttonRowStyle), [
        ...primaryChoice({ query, primary }, h),
        ...(EffectArray.isReadonlyArrayNonEmpty(secondary)
          ? [
              h.span(styledAttributes([h.AriaHidden(true)], dividerStyle)),
              h.div(styledAttributes([], mobileOnlyStyle), [
                FilterPill.view(
                  {
                    appearance: secondaryCount > 0 ? "active" : "idle",
                    onClick: Message.ClickedOpenFilters(),
                    children: [
                      Icons.filter({ size: "sm" }),
                      "Todos os filtros",
                      ...countBadge(secondaryCount, h),
                    ],
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
                  children: ["Limpar filtros"],
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
      ])
    },
  })

const filtersDrawer = (
  { model, query }: Omit<ViewState, "maybeToday">,
  h: SearchViewBuilder,
): Html =>
  h.block(
    FiltersDrawerBinding.embedView({
      slotId: "search-filters",
      model: model.filtersDrawer,
      viewInputs: {
        toView: (render) =>
          AppDrawer.view(
            {
              render,
              title: "Todos os filtros",
              size: "form",
              tone: "accent",
              isSectioned: true,
              children: [
                h.div(
                  styledAttributes([], drawerGroupsStyle),
                  secondaryFilterGroups(query).map((group) =>
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
              footer: [
                AppButton.view(
                  {
                    mode: "outline",
                    tone: "accent",
                    isDisabled: activeSecondaryFilterCount(query) === 0,
                    onClick: Message.ChangedSearchQuery({
                      query: clearedSecondaryFilters(query),
                      navigation: "Push",
                    }),
                    children: ["Limpar filtros"],
                  },
                  h,
                ),
                AppButton.view(
                  {
                    tone: "accent",
                    onClick: Message.ClickedCloseFilters(),
                    children: ["Ver resultados"],
                  },
                  h,
                ),
              ],
            },
            h,
          ),
      },
    }),
  )

/** One type's results: a way back to every type, its heading and its filters. */
const typedResults = (
  { model, query, maybeToday, type }: ViewState & Readonly<{ type: SearchType }>,
  h: SearchViewBuilder,
): Html =>
  h.div(
    [],
    [
      h.section(styledAttributes([h.AriaLabel(searchTypeTitles[type])], sectionStyle), [
        h.div(styledAttributes([], typedHeaderStyle), [
          AppButton.view(
            {
              children: [Icons.arrowLeft({ size: "sm" }), "Todos os tipos"],
              href: typeUrl(query, Option.none()),
              tone: "accent",
              mode: "bleed",
              size: "sm",
            },
            h,
          ),
          SectionHeading.view(
            { title: searchTypeTitles[type], icon: searchTypeIcons[type], element: "h1" },
            h,
          ),
          ...resultSummary({ query, maybeCount: typedCount(model, type) }, h),
        ]),
        filterBar({ model, query }, h),
        Match.value(type).pipe(
          Match.withReturnType<Html>(),
          Match.when("wiki", () =>
            resultsView(
              {
                asyncData: model.wikiAsyncData,
                onData: (articles) =>
                  articleGrid(
                    {
                      model,
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
                onData: (publications) =>
                  publicationGrid({ publications, maybeToday, maybePreview: Option.none() }, h),
              },
              h,
            ),
          ),
          Match.when("people", () =>
            resultsView(
              {
                asyncData: model.profilesAsyncData,
                onData: (profiles) => profileGrid({ profiles, maybePreview: Option.none() }, h),
              },
              h,
            ),
          ),
          Match.exhaustive,
        ),
      ]),
      filtersDrawer({ model, query }, h),
    ],
  )

export type ViewInputs = Readonly<{
  query: SearchQuery
  maybeToday: Option.Option<DateTime.Utc>
  /** Places the search field in the app bar, where the search link sits on other pages. */
  renderHeader: (search: Html) => Html
}>

export const view = SearchComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { query, maybeToday, renderHeader }, h): Html =>
    h.div(styledAttributes([], pageStyle), [
      renderHeader(searchField(query, h)),
      ...(Option.isNone(query.type) && !isBrowsing(query) ? [tabs(query, h)] : []),
      h.div(styledAttributes([], pageColumnStyle, contentStyle), [
        isBrowsing(query)
          ? browse(model, h)
          : Option.match(query.type, {
              onNone: () => overview({ model, query, maybeToday }, h),
              onSome: (type) => typedResults({ model, query, maybeToday, type }, h),
            }),
      ]),
    ]),
)
