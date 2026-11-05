import type { Handle } from "@gororobas/domain/common/primitives"
import type { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Option } from "effect"
import { Update } from "foldkit"
import { modifyFields } from "foldkit/struct"
import type { Url } from "foldkit/url"

import { FocusSearchField } from "./command"
import {
  AuthenticationBinding,
  ExternalDataAdminDashboardBinding,
  ProfileLocationsEditorBinding,
  SearchBinding,
  WikiArticleBinding,
  WikiArticleDebugBinding,
  wikiArticleKey,
} from "./composition"
import { makeFieldsStep, makeStep } from "./definition"
import {
  ApplicationRoute,
  type ObservationLogQuery,
  observationLogQueryOf,
  observationLogUrl,
  urlToApplicationRoute,
} from "./route"

const clearPagesStep = makeFieldsStep(() => ({
  maybeWikiArticle: () => Option.none(),
  maybeWikiArticleDebug: () => Option.none(),
  maybeProfileLocationsEditor: () => Option.none(),
  maybeExternalDataAdminDashboard: () => Option.none(),
}))

/** Each filter combination is its own URL, so the log loads afresh when one changes. */
const showExternalDataAdminDashboardStep = (query: ObservationLogQuery) => {
  const queryKey = observationLogUrl(query)

  return makeStep((model) =>
    Option.exists(model.maybeExternalDataAdminDashboard, (log) => log.queryKey === queryKey)
      ? { model }
      : ExternalDataAdminDashboardBinding.init({
          key: queryKey,
          args: [query],
          toParentModel: (child) =>
            modifyFields(model, {
              maybeWikiArticle: () => Option.none(),
              maybeWikiArticleDebug: () => Option.none(),
              maybeProfileLocationsEditor: () => Option.none(),
              maybeExternalDataAdminDashboard: () => Option.some({ queryKey, model: child }),
            }),
        }),
  )
}

/** The timeline reloads every time the page opens, so changes made elsewhere show up. */
const showProfileLocationsEditorStep = makeStep((model) =>
  ProfileLocationsEditorBinding.init({
    args: [],
    toParentModel: (child) =>
      modifyFields(model, {
        maybeWikiArticle: () => Option.none(),
        maybeWikiArticleDebug: () => Option.none(),
        maybeProfileLocationsEditor: () => Option.some(child),
      }),
  }),
)

const showWikiArticleStep = (lookup: Readonly<{ kind: WikiArticleKind; handle: Handle }>) => {
  const articleKey = wikiArticleKey(lookup)

  return makeStep((model) =>
    Option.exists(model.maybeWikiArticle, (article) => article.articleKey === articleKey)
      ? { model }
      : WikiArticleBinding.init({
          key: articleKey,
          args: [{ kind: lookup.kind, handle: lookup.handle }],
          toParentModel: (child) =>
            modifyFields(model, {
              maybeWikiArticle: () => Option.some({ articleKey, model: child }),
              maybeWikiArticleDebug: () => Option.none(),
            }),
        }),
  )
}

const showWikiArticleDebugStep = (
  wikiArticleId: (typeof ApplicationRoute.WikiArticleDebug.Type)["wikiArticleId"],
) =>
  makeStep((model) =>
    Option.exists(model.maybeWikiArticleDebug, (debug) => debug.wikiArticleId === wikiArticleId)
      ? { model }
      : WikiArticleDebugBinding.init({
          key: wikiArticleId,
          args: [wikiArticleId],
          toParentModel: (child) =>
            modifyFields(model, {
              maybeWikiArticle: () => Option.none(),
              maybeWikiArticleDebug: () => Option.some({ wikiArticleId, model: child }),
            }),
        }),
  )

/** Prepares the page a route shows, keeping it when the route still shows the same one. */
export const enterRouteStep = (route: ApplicationRoute) =>
  ApplicationRoute.match(route, {
    WikiArticleDebug: ({ wikiArticleId }) => showWikiArticleDebugStep(wikiArticleId),
    Login: () =>
      Update.combineSteps([clearPagesStep, AuthenticationBinding.requestRestoreSession()]),
    Search: ({ _tag, ...query }) =>
      Update.combineSteps([clearPagesStep, SearchBinding.informQueryChange({ query })]),
    WikiArticle: ({ kind, handle }) => showWikiArticleStep({ kind, handle }),
    MyPlaces: () => showProfileLocationsEditorStep,
    ExternalDataAdminDashboard: (route) =>
      showExternalDataAdminDashboardStep(observationLogQueryOf(route)),
    NotFound: () => clearPagesStep,
  })

/** The search link's request lasts one navigation: arriving anywhere else drops it. */
const consumeSearchFieldFocusStep = (route: ApplicationRoute) =>
  makeStep((model) => ({
    model: modifyFields(model, { isSearchFieldFocusPending: () => false }),
    commands:
      model.isSearchFieldFocusPending && ApplicationRoute.guards.Search(route)
        ? [FocusSearchField()]
        : [],
  }))

export const changeRouteStep = (url: Url) => {
  const route = urlToApplicationRoute(url)

  return Update.combineSteps([
    makeFieldsStep(() => ({ route: () => route })),
    enterRouteStep(route),
    consumeSearchFieldFocusStep(route),
  ])
}
