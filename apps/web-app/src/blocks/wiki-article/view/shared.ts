import type { MediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { tiptapToText } from "@gororobas/domain/rich-text/tiptap-to-text"
import type { WikiArticleQueriedPageData } from "@gororobas/domain/wiki/domain"
import { Style } from "@pleat/core"
import { Array as EffectArray, DateTime, Option, String as EffectString } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type WikiArticleTab, wikiArticleUrl } from "../../../app/route"
import { AppButton } from "../../../ui/app-button"
import { AppText } from "../../../ui/app-text"
import { Chip } from "../../../ui/chip"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { emptyStateStyle } from "../../../ui/styles/surfaces"
import { breakpoint, space } from "../../../ui/theme"
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
  gap: space[2],
  overflowX: "auto",
  scrollbarWidth: "none",
})

const tabStyle = Style.make({ flexShrink: 0 })

export const images = (page: Page): ReadonlyArray<ImageAsset> =>
  EffectArray.filter(page.mediaAssets, (media): media is ImageAsset => media.format === "IMAGE")

/** The pt description of a photo, as plain text. */
export const caption = (media: MediaAssetRow): Option.Option<string> =>
  Option.fromNullishOr(media.descriptions.pt).pipe(
    Option.map((document) => EffectString.trim(tiptapToText(document))),
    Option.filter(EffectString.isNonEmpty),
  )

export const tabs = (
  { page, currentTab, label }: Readonly<{ page: Page; currentTab: WikiArticleTab; label: string }>,
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
    entries.map(([tab, label]) =>
      AppButton.view(
        {
          children: [label],
          href: wikiArticleUrl({ kind: page.kind, handle: page.handle }, tab),
          ariaCurrent: tab === currentTab ? "page" : "false",
          mode: tab === currentTab ? "default" : "outline",
          tone: "accent",
          size: "sm",
          styles: [tabStyle],
        },
        h,
      ),
    ),
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
