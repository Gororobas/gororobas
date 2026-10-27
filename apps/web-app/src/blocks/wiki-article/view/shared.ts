import type { MediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { tiptapToText } from "@gororobas/domain/rich-text/tiptap-to-text"
import type { WikiArticleQueriedPageData } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Option, String as EffectString } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type WikiArticleTab, wikiArticleUrl } from "../../../app/route"
import { AppText } from "../../../ui/app-text"
import { Chip } from "../../../ui/chip"
import * as Icons from "../../../ui/icons"
import type { IconConfig } from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { emptyStateStyle } from "../../../ui/styles/surfaces"
import {
  borderWidth,
  breakpoint,
  duration,
  fontSize,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
} from "../../../ui/theme"
import type { WikiArticleViewBuilder } from "../composition"
import type { Model } from "../model"

export type Page = WikiArticleQueriedPageData

/** The inputs most article sections render from. */
export type ArticleState = Readonly<{
  model: Model
  page: Page
  /** Dates read relative to it; without it, cards show the full date. */
  maybeToday: Option.Option<DateTime.Utc>
}>

export type ImageAsset = Extract<MediaAssetRow, { format: "IMAGE" }>

export const sectionsStyle = Style.make({
  display: "grid",
  rowGap: space[5],
  paddingBlock: space[5],
}).pipe(Style.when(breakpoint.md, { rowGap: space[6], paddingBlock: space[8] }))

export const listStyle = Style.make({ display: "grid", rowGap: space[3] })

export const chipRowStyle = Style.make({
  display: "flex",
  gap: space[2],
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBlock: space[1],
})

const tabsStyle = Style.make({
  display: "flex",
  gap: space[1],
  overflowX: "auto",
  scrollbarWidth: "none",
})

/** Underlined tabs that sit on the header's bottom edge. */
const tabStyle = Style.make({
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  gap: space[2],
  paddingInline: space[3],
  paddingBlock: space[3],
  borderBlockEnd: `${borderWidth.thick} solid transparent`,
  borderStartStartRadius: radius.md,
  borderStartEndRadius: radius.md,
  color: tones.neutral.ramp[700],
  fontWeight: fontWeight.semibold,
  outline: "none",
  transitionProperty: "color, background-color, border-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { color: tones.neutral.ramp[900], backgroundColor: toneColors.hover }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const currentTabStyle = Style.make({
  color: tones.accent.ramp[800],
  borderBlockEndColor: tones.accent.ramp[600],
})

const compactTabStyle = Style.make({ paddingBlock: space[2], fontSize: fontSize.footnote })

const tabIcons: Readonly<Record<WikiArticleTab, (config?: IconConfig) => Html>> = {
  About: Icons.encyclopedia,
  Publications: Icons.clipboard,
  Photos: Icons.gallery,
  Contributions: Icons.users,
}

export const images = (page: Page): ReadonlyArray<ImageAsset> =>
  EffectArray.filter(page.mediaAssets, (media): media is ImageAsset => media.format === "IMAGE")

/** The pt description of a photo, as plain text. */
export const caption = (media: MediaAssetRow): Option.Option<string> =>
  Option.fromNullishOr(media.descriptions.pt).pipe(
    Option.map((document) => EffectString.trim(tiptapToText(document))),
    Option.filter(EffectString.isNonEmpty),
  )

export const tabs = (
  {
    page,
    currentTab,
    label,
    isCompact = false,
  }: Readonly<{
    page: Page
    currentTab: WikiArticleTab
    label: string
    /** The compact header's tabs, smaller and without icons. */
    isCompact?: boolean
  }>,
  h: WikiArticleViewBuilder,
): Html => {
  const entries: ReadonlyArray<readonly [WikiArticleTab, string]> = [
    ["About", "Sobre"],
    ["Publications", "Publicações"],
    ["Photos", "Fotos"],
    ["Contributions", "Contribuições"],
  ]

  return h.nav(
    styledAttributes([h.AriaLabel(label)], tabsStyle),
    entries.map(([tab, tabLabel]) => {
      const isCurrent = tab === currentTab

      return h.a(
        styledAttributes(
          [
            h.Href(wikiArticleUrl({ kind: page.kind, handle: page.handle }, tab)),
            h.AriaCurrent(isCurrent ? "page" : "false"),
          ],
          tabStyle,
          ...(isCurrent ? [currentTabStyle] : []),
          ...(isCompact ? [compactTabStyle] : []),
        ),
        [
          ...(isCompact ? [] : [tabIcons[tab]({ mode: isCurrent ? "duotone" : "outline" })]),
          tabLabel,
        ],
      )
    }),
  )
}

export const emptyState = (text: string, h: WikiArticleViewBuilder): Html =>
  h.p(styledAttributes([], emptyStateStyle({ size: "compact" })), [text])

export const asyncView = <A>(
  {
    asyncData,
    onData,
  }: Readonly<{ asyncData: AsyncData.AsyncData<A, string>; onData: (data: A) => Html }>,
  h: WikiArticleViewBuilder,
): Html =>
  AsyncData.matchData(asyncData, {
    onEmpty: () =>
      AppText.view(
        {
          element: "p",
          appearance: "footnote",
          isMuted: true,
          attributes: [h.Role("status")],
          children: ["Carregando…"],
        },
        h,
      ),
    onFailure: () => emptyState("Não foi possível carregar agora.", h),
    onData,
  })

/** Chips that narrow a list in place: "Todos" first, then one per value. */
export const filterChips = <Value>(
  config: Readonly<{
    label: string
    options: ReadonlyArray<readonly [Value, string]>
    selected: Option.Option<Value>
    toMessage: (value: Option.Option<Value>) => Parameters<WikiArticleViewBuilder["OnClick"]>[0]
  }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([h.Role("group"), h.AriaLabel(config.label)], chipRowStyle), [
    Chip.view(
      {
        label: "Todos",
        appearance: Option.isNone(config.selected) ? "selectedOption" : "option",
        isPressed: Option.isNone(config.selected),
        onClick: config.toMessage(Option.none()),
      },
      h,
    ),
    ...config.options.map(([value, label]) =>
      Chip.view(
        {
          label,
          appearance: Option.contains(config.selected, value) ? "selectedOption" : "option",
          isPressed: Option.contains(config.selected, value),
          onClick: config.toMessage(Option.some(value)),
        },
        h,
      ),
    ),
  ])
