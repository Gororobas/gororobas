import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Color, Global, Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Match, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type WikiArticleTab, wikiArticleUrl } from "../../../app/route"
import { ofName, primaryName } from "../../../lib/wiki-article-names"
import { AppText } from "../../../ui/app-text"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { pageColumnStyle } from "../../../ui/styles/page-column"
import {
  borderWidth,
  breakpoint,
  controlSize,
  layer,
  radius,
  space,
  toneColors,
  tones,
  toneStyle,
  viewport,
} from "../../../ui/theme"
import { Thumbnail } from "../../../ui/thumbnail"
import { WikiArticleComposition, type WikiArticleViewBuilder } from "../composition"
import * as About from "./about"
import * as Overview from "./overview"
import { type Page, emptyState, images, tabs } from "./shared"
import * as Tabs from "./tabs"

// The page scrolls the document; once the article's own header leaves the viewport, a compact
// copy slides in from the top so readers always know which article they're in. It's driven by
// a scroll-driven animation on the header's view timeline, with no scroll listeners.
const HEADER_TIMELINE = "--wiki-article-header"

const articleStyle = Style.make({ timelineScope: HEADER_TIMELINE })

const headerBandStyle = Style.make({
  backgroundColor: toneColors.backgroundCard,
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
  viewTimelineName: HEADER_TIMELINE,
})

const headerStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  paddingBlockStart: space[5],
}).pipe(Style.when(breakpoint.md, { paddingBlockStart: space[8] }))

const identityStyle = Style.make({ display: "flex", alignItems: "center", gap: space[4] })
const titleStyle = Style.make({ color: tones.secondary.emphasis })
const scientificNameStyle = Style.make({ fontStyle: "italic", color: tones.neutral.shade[700] })
const parentPlantStyle = Style.make({ color: tones.neutral.shade[700] })

const parentPlantLinkStyle = Style.make({
  color: tones.accent.shade[800],
  textDecorationLine: "underline",
  textDecorationColor: tones.accent.shade[300],
  textUnderlineOffset: "0.2em",
  borderRadius: radius.sm,
  outline: "none",
}).pipe(
  Style.when(When.hover, { textDecorationColor: tones.accent.shade[700] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const statusStyle = Style.make({ paddingBlock: space[6] })

const thumbnailLinkStyle = Style.make({
  flexShrink: 0,
  borderRadius: "28%",
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const revealCompactHeader = Global.keyframes("reveal-compact-header", {
  from: { transform: "translateY(-100%)", visibility: "hidden" },
  to: { transform: "translateY(0)", visibility: "visible" },
})

const compactHeaderStyle = Style.make({ display: "none" }).pipe(
  Style.when(When.supports("(animation-timeline: view())"), {
    position: "fixed",
    insetBlockStart: 0,
    insetInline: 0,
    zIndex: layer.header,
    display: "block",
    paddingBlockStart: viewport.safeAreaTop,
    backgroundColor: Color.alpha(toneColors.backgroundCard, 0.96),
    backdropFilter: "blur(8px)",
    borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
    boxShadow: "0 4px 16px rgb(0 0 0 / 6%)",
    animationName: revealCompactHeader,
    animationTimingFunction: "linear",
    animationFillMode: "both",
    animationTimeline: HEADER_TIMELINE,
    animationRange: "exit 60% exit 100%",
  }),
)

const compactInnerStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  minBlockSize: controlSize.lg,
})

const compactIdentityStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  minInlineSize: 0,
  flexShrink: 0,
})

const compactNameStyle = Style.make({
  color: tones.secondary.emphasis,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

const compactTabsStyle = Style.make({
  display: "none",
  alignSelf: "flex-end",
  minInlineSize: 0,
}).pipe(Style.when(breakpoint.md, { display: "block", marginInlineStart: "auto" }))

const compactIdentityPaddingStyle = Style.make({ paddingBlock: space[2] })

const scientificName = (page: Page): Option.Option<string> =>
  EffectArray.head(Overview.scientificNames(page))

const parentPlant = (page: Page): Option.Option<WikiArticleQueriedCardData> =>
  page.kind === "PLANT_CULTIVAR" ? Option.map(page.parentPlant, ({ card }) => card) : Option.none()

/** "Variedade do Ingá", leading to the plant whose traits the cultivar inherits. */
const parentPlantLink = (card: WikiArticleQueriedCardData, h: WikiArticleViewBuilder): Html =>
  AppText.view(
    {
      element: "p",
      appearance: "large",
      styles: [parentPlantStyle],
      children: [
        "Variedade ",
        h.a(styledAttributes([h.Href(wikiArticleUrl(card))], parentPlantLinkStyle), [ofName(card)]),
      ],
    },
    h,
  )

/** The first photo, linking to every photo of the article. */
const headerThumbnail = (
  { page, size }: Readonly<{ page: Page; size: "sm" | "md" }>,
  h: WikiArticleViewBuilder,
): Html => {
  const maybeFirst = EffectArray.head(images(page))

  const thumbnail = Thumbnail.view(
    {
      maybeMediaAssetId: Option.map(maybeFirst, (photo) => photo.id),
      alt: Option.isSome(maybeFirst) ? `Fotos ${ofName(page)}` : "",
      size,
    },
    h,
  )

  return Option.isSome(maybeFirst)
    ? h.a(styledAttributes([h.Href(wikiArticleUrl(page, "Photos"))], thumbnailLinkStyle), [
        thumbnail,
      ])
    : thumbnail
}

const header = (
  { page, tab }: Readonly<{ page: Page; tab: WikiArticleTab }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], headerBandStyle, toneStyle("primary")), [
    h.header(styledAttributes([], pageColumnStyle, headerStyle), [
      h.div(styledAttributes([], identityStyle), [
        headerThumbnail({ page, size: "md" }, h),
        h.div(
          [],
          [
            AppText.view(
              {
                element: "h1",
                appearance: "xxl",
                weight: "semibold",
                lineHeight: "tight",
                styles: [titleStyle],
                children: [primaryName(page)],
              },
              h,
            ),
            ...EffectArray.fromOption(
              Option.map(parentPlant(page), (card) => parentPlantLink(card, h)),
            ),
            ...EffectArray.fromOption(
              Option.map(scientificName(page), (name) =>
                AppText.view(
                  {
                    element: "p",
                    appearance: "large",
                    styles: [scientificNameStyle],
                    children: [name],
                  },
                  h,
                ),
              ),
            ),
          ],
        ),
      ]),
      tabs({ page, currentTab: tab, label: `Seções ${ofName(page)}` }, h),
    ]),
  ])

/** Repeats the header's name and tabs. While hidden, `visibility` keeps its links out of the tab order. */
const compactHeader = (
  { page, tab }: Readonly<{ page: Page; tab: WikiArticleTab }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], compactHeaderStyle, toneStyle("primary")), [
    h.div(styledAttributes([], pageColumnStyle, compactInnerStyle), [
      h.a(
        styledAttributes(
          [h.Href(wikiArticleUrl(page))],
          compactIdentityStyle,
          compactIdentityPaddingStyle,
        ),
        [
          Thumbnail.view(
            {
              maybeMediaAssetId: Option.map(EffectArray.head(images(page)), (photo) => photo.id),
              alt: "",
              size: "xs",
            },
            h,
          ),
          AppText.view(
            {
              element: "span",
              appearance: "large",
              weight: "semibold",
              lineHeight: "tight",
              styles: [compactNameStyle],
              children: [primaryName(page)],
            },
            h,
          ),
        ],
      ),
      h.div(styledAttributes([], compactTabsStyle), [
        tabs(
          { page, currentTab: tab, label: `Seções ${ofName(page)}, atalho`, isCompact: true },
          h,
        ),
      ]),
    ]),
  ])

export type ViewInputs = Readonly<{
  tab: WikiArticleTab
  isSignedIn: boolean
  maybeToday: Option.Option<DateTime.Utc>
}>

export const view = WikiArticleComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { tab, isSignedIn, maybeToday }, h): Html =>
    AsyncData.matchData(model.pageAsyncData, {
      onEmpty: () =>
        h.p(styledAttributes([h.Role("status")], pageColumnStyle, statusStyle), [
          "Carregando artigo…",
        ]),
      onFailure: (error) =>
        h.div(styledAttributes([], pageColumnStyle, statusStyle), [
          emptyState(
            error === "NotFound"
              ? "Não encontramos esse artigo na enciclopédia."
              : "Não foi possível carregar o artigo agora.",
            h,
          ),
        ]),
      onData: (page) =>
        h.article(styledAttributes([], articleStyle), [
          header({ page, tab }, h),
          compactHeader({ page, tab }, h),
          h.div(styledAttributes([], pageColumnStyle), [
            Match.value(tab).pipe(
              Match.withReturnType<Html>(),
              Match.when("About", () => About.view({ model, page, maybeToday, isSignedIn }, h)),
              Match.when("Publications", () => Tabs.publications({ model, page, maybeToday }, h)),
              Match.when("Photos", () => Tabs.photos({ model, page, maybeToday }, h)),
              Match.when("Contributions", () => Tabs.contributions({ model, page, maybeToday }, h)),
              Match.exhaustive,
            ),
          ]),
        ]),
    }),
)
