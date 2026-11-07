import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { msg, select } from "@lingui/core/macro"
import { Color, Global, Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Match, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import {
  type WikiArticleTab,
  searchUrl,
  wikiArticleDebugUrl,
  wikiArticleUrl,
} from "../../../app/route"
import { wikiScope } from "../../../app/search-query"
import type { LanguageInputs } from "../../../lib/language"
import { translatorFor } from "../../../lib/translations"
import { placeKindLabels, wikiKindLabels } from "../../../lib/vocabulary"
import { nameGender, nameParts, primaryName } from "../../../lib/wiki-article-names"
import { AppButton } from "../../../ui/app-button"
import { AppText } from "../../../ui/app-text"
import { EmptyState } from "../../../ui/empty-state"
import * as Icons from "../../../ui/icons"
import { LoadingState } from "../../../ui/loading-state"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { pageColumnStyle } from "../../../ui/styles/page-column"
import { blur } from "../../../ui/theme"
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
import type { Model } from "../model"
import * as About from "./about"
import * as Classification from "./classification"
import * as Overview from "./overview"
import { mainPhoto } from "./photos"
import { type Page, tabs } from "./shared"
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

// `minInlineSize: 0` lets long names and the classification shrink instead of widening the page.
const identityStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[4],
  minInlineSize: 0,
})

const identityTextStyle = Style.make({ flex: 1, minInlineSize: 0 })
const debugLinkStyle = Style.make({ alignSelf: "flex-start", flexShrink: 0 })

/** Development builds link each article to its stored data, projections and provider observations. */
const debugLink = (
  { page, language }: Readonly<{ page: Page; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  import.meta.env.DEV
    ? [
        AppButton.view(
          {
            href: wikiArticleDebugUrl(language, page.id),
            // Icon-only, so this development aid doesn't crowd the article's names.
            children: [Icons.sledgehammer({ size: "sm" })],
            ariaLabel: translatorFor(language)._(msg`Debug article`),
            title: translatorFor(language)._(msg`See this article's stored data`),
            tone: "neutral",
            mode: "outline",
            size: "sm",
            styles: [debugLinkStyle],
          },
          h,
        ),
      ]
    : []

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

/** Phones leave the photo to the compact header, so names and classification get the width. */
const headerThumbnailStyle = Style.make({ display: "none" }).pipe(
  Style.when(breakpoint.md, { display: "contents" }),
)

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
    backdropFilter: blur.chrome,
    borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
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

/** "Variety of Ingá", leading to the plant whose traits the cultivar inherits. */
const parentPlantLink = (
  { card, language }: Readonly<{ card: WikiArticleQueriedCardData; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): Html => {
  const gender = nameGender(card)
  // The name is a link, so the message only holds the words that agree with it.
  const prefix = translatorFor(language)._(msg`${select(gender, { other: "Variety of" })}`)

  return AppText.view(
    {
      element: "p",
      appearance: "large",
      styles: [parentPlantStyle],
      children: [
        `${prefix} `,
        h.a(styledAttributes([h.Href(wikiArticleUrl(language, card))], parentPlantLinkStyle), [
          primaryName(card),
        ]),
      ],
    },
    h,
  )
}

const articleLink = (
  { card, language }: Readonly<{ card: WikiArticleQueriedCardData; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.a(styledAttributes([h.Href(wikiArticleUrl(language, card))], parentPlantLinkStyle), [
    primaryName(card),
  ])

/** "Municipality in Boyacá · Colombia", each containing place leading to its own page. */
const placeLineage = (
  { page, language }: Readonly<{ page: Page; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  if (page.kind !== "PLACE") {
    return []
  }

  const i18n = translatorFor(language)

  const kind = i18n._(
    Option.match(page.attributes.placeKind, {
      onNone: () => wikiKindLabels.PLACE.singular,
      onSome: (placeKind) => placeKindLabels[placeKind],
    }),
  )

  return EffectArray.match(page.ancestorPlaces, {
    onEmpty: () => [],
    onNonEmpty: ([parent, ...others]) => [
      AppText.view(
        {
          element: "p",
          appearance: "large",
          styles: [parentPlantStyle],
          children: [
            // The parent's name is a link, so the message only holds the words that agree with it.
            `${i18n._(msg`${select(nameGender(parent), { other: `${kind} in` })}`)} `,
            articleLink({ card: parent, language }, h),
            ...others.flatMap((ancestor) => [" · ", articleLink({ card: ancestor, language }, h)]),
          ],
        },
        h,
      ),
    ],
  })
}

/** The first photo, linking to every photo of the article. */
const headerThumbnail = (
  {
    language,
    page,
    size,
  }: Readonly<{ language: SupportedLanguage; page: Page; size: "sm" | "md" }>,
  h: WikiArticleViewBuilder,
): Html => {
  const maybeFirst = mainPhoto(page)
  const { name, gender } = nameParts(page)

  const thumbnail = Thumbnail.view(
    {
      maybeSrc: Option.map(maybeFirst, (photo) => photo.src(300)),
      alt: Option.isSome(maybeFirst)
        ? translatorFor(language)._(msg`${select(gender, { other: `Photos of ${name}` })}`)
        : "",
      size,
    },
    h,
  )

  return Option.isSome(maybeFirst)
    ? h.a(
        styledAttributes(
          [
            h.Href(
              wikiArticleUrl(language, { kind: page.kind, handle: page.handle, tab: "Photos" }),
            ),
          ],
          thumbnailLinkStyle,
        ),
        [thumbnail],
      )
    : thumbnail
}

const header = (
  {
    model,
    language,
    page,
    tab,
  }: Readonly<{ model: Model; language: SupportedLanguage; page: Page; tab: WikiArticleTab }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], headerBandStyle, toneStyle("primary")), [
    h.header(styledAttributes([], pageColumnStyle, headerStyle), [
      h.div(styledAttributes([], identityStyle), [
        h.div(styledAttributes([], headerThumbnailStyle), [
          headerThumbnail({ language, page, size: "md" }, h),
        ]),
        h.div(styledAttributes([], identityTextStyle), [
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
            Option.map(parentPlant(page), (card) => parentPlantLink({ card, language }, h)),
          ),
          ...placeLineage({ page, language }, h),
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
          ...Classification.view({ model, language, page }, h),
        ]),
        ...debugLink({ page, language }, h),
      ]),
      tabs({ language, page, currentTab: tab, label: sectionsLabel({ language, page }) }, h),
    ]),
  ])

const sectionsLabel = ({
  language,
  page,
}: Readonly<{ language: SupportedLanguage; page: Page }>) => {
  const { name, gender } = nameParts(page)
  return translatorFor(language)._(msg`${select(gender, { other: `Sections of ${name}` })}`)
}

/** Repeats the header's name and tabs. While hidden, `visibility` keeps its links out of the tab order. */
const compactHeader = (
  {
    language,
    page,
    tab,
  }: Readonly<{ language: SupportedLanguage; page: Page; tab: WikiArticleTab }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], compactHeaderStyle, toneStyle("primary")), [
    h.div(styledAttributes([], pageColumnStyle, compactInnerStyle), [
      h.a(
        styledAttributes(
          [h.Href(wikiArticleUrl(language, page))],
          compactIdentityStyle,
          compactIdentityPaddingStyle,
        ),
        [
          Thumbnail.view(
            {
              maybeSrc: Option.map(mainPhoto(page), (photo) => photo.src(300)),
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
          {
            language,
            page,
            currentTab: tab,
            label: translatorFor(language)._(msg`${sectionsLabel({ language, page })}, shortcut`),
            isCompact: true,
          },
          h,
        ),
      ]),
    ]),
  ])

export type ViewInputs = LanguageInputs &
  Readonly<{
    tab: WikiArticleTab
    isSignedIn: boolean
    maybeToday: Option.Option<DateTime.Utc>
  }>

export const view = WikiArticleComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language, tab, isSignedIn, maybeToday }, h): Html =>
    AsyncData.matchData(model.pageAsyncData, {
      onEmpty: () =>
        LoadingState.page(
          { label: translatorFor(language)._(msg`Loading article`), media: "square" },
          h,
        ),
      onFailure: (error) =>
        h.div(styledAttributes([], pageColumnStyle, statusStyle), [
          error.cause === "NotFound"
            ? EmptyState.view(
                {
                  icon: Icons.encyclopedia,
                  title: translatorFor(language)._(
                    msg`We couldn't find this article in the encyclopedia`,
                  ),
                  maybeDescription: Option.some(
                    translatorFor(language)._(
                      msg`It may have been renamed. Try finding it through search.`,
                    ),
                  ),
                  maybeAction: Option.some({
                    label: translatorFor(language)._(msg`Search the encyclopedia`),
                    href: searchUrl(language, { scope: wikiScope() }),
                  }),
                  size: "roomy",
                },
                h,
              )
            : EmptyState.view(
                {
                  icon: Icons.alertCircle,
                  title: translatorFor(language)._(msg`Couldn't load the article right now`),
                  maybeDescription: Option.some(
                    translatorFor(language)._(msg`Try reloading the page in a moment.`),
                  ),
                  size: "roomy",
                },
                h,
              ),
        ]),
      onData: (page) =>
        h.article(styledAttributes([], articleStyle), [
          header({ model, language, page, tab }, h),
          compactHeader({ language, page, tab }, h),
          h.div(styledAttributes([], pageColumnStyle), [
            Match.value(tab).pipe(
              Match.withReturnType<Html>(),
              Match.when("About", () =>
                About.view({ model, language, page, maybeToday, isSignedIn }, h),
              ),
              Match.when("Publications", () =>
                Tabs.publications({ model, language, page, maybeToday }, h),
              ),
              Match.when("Photos", () => Tabs.photos({ model, language, page, maybeToday }, h)),
              Match.when("Contributions", () =>
                Tabs.contributions({ model, language, page, maybeToday }, h),
              ),
              Match.exhaustive,
            ),
          ]),
        ]),
    }),
)
