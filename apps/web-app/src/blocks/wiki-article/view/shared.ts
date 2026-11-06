import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { WikiArticleQueriedPageData } from "@gororobas/domain/wiki/domain"
import { Style } from "@pleat/core"
import { DateTime, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type WikiArticleTab, wikiArticleUrl } from "../../../app/route"
import type { ClientFailure } from "../../../lib/client-failure"
import { EmptyState } from "../../../ui/empty-state"
import * as Icons from "../../../ui/icons"
import type { IconConfig } from "../../../ui/icons"
import { type LoadingShape, LoadingState } from "../../../ui/loading-state"
import { pageColumnBleedStyle } from "../../../ui/styles/page-column"
import { TabNavigation } from "../../../ui/tab-navigation"
import { breakpoint, space } from "../../../ui/theme"
import type { WikiArticleViewBuilder } from "../composition"
import type { Model } from "../model"

export type Page = WikiArticleQueriedPageData

/** The inputs most article sections render from. */
export type ArticleState = Readonly<{
  model: Model
  language: SupportedLanguage
  page: Page
  /** Dates read relative to it; without it, cards show the full date. */
  maybeToday: Option.Option<DateTime.Utc>
}>

export const sectionsStyle = Style.make({
  display: "grid",
  rowGap: space[5],
  paddingBlock: space[5],
}).pipe(Style.when(breakpoint.md, { rowGap: space[6], paddingBlock: space[8] }))

export const listStyle = Style.make({ display: "grid", rowGap: space[3] })

const tabIcons: Readonly<Record<WikiArticleTab, (config?: IconConfig) => Html>> = {
  About: Icons.encyclopedia,
  Publications: Icons.clipboard,
  Photos: Icons.gallery,
  Contributions: Icons.users,
}

export const tabs = (
  {
    language,
    page,
    currentTab,
    label,
    isCompact = false,
  }: Readonly<{
    language: SupportedLanguage
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

  return TabNavigation.view(
    {
      ariaLabel: label,
      size: isCompact ? "compact" : "regular",
      // The compact header's tabs share a row with the name, away from the screen's edges.
      styles: isCompact ? [] : [pageColumnBleedStyle],
      items: entries.map(([tab, tabLabel]) => ({
        key: tab,
        label: tabLabel,
        href: wikiArticleUrl(language, { kind: page.kind, handle: page.handle, tab }),
        isCurrent: tab === currentTab,
        maybeIcon: tabIcons[tab],
      })),
    },
    h,
  )
}

export const asyncView = <A>(
  {
    asyncData,
    loading,
    onData,
  }: Readonly<{
    asyncData: AsyncData.AsyncData<A, ClientFailure>
    loading: Readonly<{ label: string; shape: LoadingShape; count?: number }>
    onData: (data: A) => Html
  }>,
  h: WikiArticleViewBuilder,
): Html =>
  AsyncData.matchData(asyncData, {
    onEmpty: () => LoadingState.view(loading, h),
    onFailure: () =>
      EmptyState.view(
        {
          icon: Icons.alertCircle,
          title: "Não foi possível carregar agora",
          maybeDescription: Option.some("Tente recarregar a página em instantes."),
        },
        h,
      ),
    onData,
  })
