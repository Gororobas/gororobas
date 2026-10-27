import { Style } from "@pleat/core"
import { Option } from "effect"
import type { Document, Html } from "foldkit/html"

import { isSignedIn, viewerName } from "../blocks/authentication"
import * as AppShell from "../ui/app-shell"
import { AppText } from "../ui/app-text"
import * as Icons from "../ui/icons"
import { styledAttributes } from "../ui/pleat-attributes"
import { measure, space } from "../ui/theme"
import {
  ApplicationComposition,
  type ApplicationViewBuilder,
  AuthenticationBinding,
  SearchBinding,
  WikiArticleBinding,
  WikiArticleDebugBinding,
  wikiArticleKey,
} from "./composition"
import type { Model } from "./model"
import { ApplicationRoute, type SearchType, loginRouter, searchUrl } from "./route"

// SHARED STYLES

// The document scrolls, so the app bar leaves with the content and pages can pin their own headers.
// `clip` keeps a stray wide element from scrolling the whole page sideways on phones, and,
// unlike `hidden`, doesn't create a scroll container, so sticky headers keep working.
const shellStyle = Style.make({
  display: "flex",
  minBlockSize: "100dvh",
  flexDirection: "column",
  overflowX: "clip",
})

const mainStyle = Style.make({ display: "flex", flex: 1, flexDirection: "column" })

/** Search and articles lay out their own wide columns; other pages read as one column. */
const proseStyle = Style.make({
  inlineSize: "100%",
  maxInlineSize: measure.prose,
  marginInline: "auto",
})

const notFoundStyle = Style.make({ display: "grid", rowGap: space[3], padding: space[6] })

// NAVIGATION

const isSearchType = (route: ApplicationRoute, type: SearchType) =>
  ApplicationRoute.guards.Search(route) && Option.contains(route.type, type)

const navigationItems = (model: typeof Model.Type): ReadonlyArray<AppShell.NavigationItem> => [
  {
    label: "Enciclopédia",
    href: searchUrl({ type: Option.some("wiki") }),
    icon: Icons.encyclopedia,
    isCurrent:
      isSearchType(model.route, "wiki") || ApplicationRoute.guards.WikiArticle(model.route),
  },
  {
    label: "Posts",
    href: searchUrl({ type: Option.some("publications") }),
    icon: Icons.clipboard,
    isCurrent: isSearchType(model.route, "publications"),
  },
  {
    label: "Gente",
    href: searchUrl({ type: Option.some("people") }),
    icon: Icons.users,
    isCurrent: isSearchType(model.route, "people"),
  },
]

/** Search takes over the app bar: no navigation or account competes with the field. */
const header = (
  { model, search }: Readonly<{ model: typeof Model.Type; search: Html }>,
  h: ApplicationViewBuilder,
): Html =>
  AppShell.header(
    {
      homeHref: searchUrl(),
      search,
      navigation: ApplicationRoute.guards.Search(model.route) ? [] : navigationItems(model),
      maybeAccount: ApplicationRoute.guards.Search(model.route)
        ? Option.none()
        : Option.some({
            href: loginRouter(),
            maybeViewer: Option.map(viewerName(model.authentication), (name) => ({ name })),
          }),
    },
    h,
  )

const notFound = (path: string, h: ApplicationViewBuilder): Html =>
  h.section(styledAttributes([], notFoundStyle), [
    AppText.view(
      { element: "h1", appearance: "xl", weight: "semibold", children: ["Página não encontrada"] },
      h,
    ),
    AppText.view({ element: "p", isMuted: true, children: [`Não há nada em ${path}.`] }, h),
  ])

const prose = (content: Html, h: ApplicationViewBuilder): Html =>
  h.div(styledAttributes([], proseStyle), [content])

const page = (model: typeof Model.Type, h: ApplicationViewBuilder): Html =>
  ApplicationRoute.match(model.route, {
    Search: ({ _tag, ...query }) =>
      h.block(
        SearchBinding.embedView({
          slotId: "search",
          model: model.search,
          viewInputs: {
            query,
            maybeToday: model.maybeToday,
            renderHeader: (search) => header({ model, search }, h),
          },
        }),
      ),
    WikiArticle: (route) =>
      Option.match(model.maybeWikiArticle, {
        onNone: () => h.empty,
        onSome: (article) =>
          article.articleKey === wikiArticleKey(route)
            ? h.block(
                WikiArticleBinding.embedView({
                  key: article.articleKey,
                  slotId: "wiki-article",
                  model: article.model,
                  viewInputs: {
                    tab: route.tab,
                    isSignedIn: isSignedIn(model.authentication),
                    maybeToday: model.maybeToday,
                  },
                }),
              )
            : h.empty,
      }),
    WikiArticleDebug: ({ wikiArticleId }) =>
      prose(
        Option.match(model.maybeWikiArticleDebug, {
          onNone: () => h.empty,
          onSome: (debug) =>
            debug.wikiArticleId === wikiArticleId
              ? h.block(
                  WikiArticleDebugBinding.embedView({
                    key: wikiArticleId,
                    slotId: "wiki-article-debug",
                    model: debug.model,
                  }),
                )
              : h.empty,
        }),
        h,
      ),
    Login: () =>
      prose(
        h.block(
          AuthenticationBinding.embedView({
            slotId: "authentication",
            model: model.authentication,
          }),
        ),
        h,
      ),
    NotFound: ({ path }) => prose(notFound(path, h), h),
  })

const title = (route: ApplicationRoute): string =>
  ApplicationRoute.match(route, {
    Search: () => "Busca | Gororobas",
    WikiArticle: () => "Enciclopédia | Gororobas",
    WikiArticleDebug: () => "Depuração | Gororobas",
    Login: () => "Entrar | Gororobas",
    NotFound: () => "Página não encontrada | Gororobas",
  })

export const view = ApplicationComposition.makeView((model, h): Document => ({
  title: title(model.route),
  body: h.div(styledAttributes([], shellStyle), [
    ...(ApplicationRoute.guards.Search(model.route)
      ? []
      : [header({ model, search: AppShell.searchLink(searchUrl(), h) }, h)]),
    h.main(styledAttributes([], mainStyle), [page(model, h)]),
    ...(ApplicationRoute.guards.Search(model.route)
      ? []
      : [AppShell.bottomNavigation(navigationItems(model), h)]),
  ]),
}))
