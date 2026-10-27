import type { Handle } from "@gororobas/domain/common/primitives"
import type { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Option } from "effect"
import { Update } from "foldkit"
import { modifyFields } from "foldkit/struct"
import type { Url } from "foldkit/url"

import {
  AuthenticationBinding,
  SearchBinding,
  WikiArticleBinding,
  WikiArticleDebugBinding,
  wikiArticleKey,
} from "./composition"
import { makeFieldsStep, makeStep } from "./definition"
import { ApplicationRoute, urlToApplicationRoute } from "./route"

const clearPagesStep = makeFieldsStep(() => ({
  maybeWikiArticle: () => Option.none(),
  maybeWikiArticleDebug: () => Option.none(),
}))

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
      Update.combineSteps([clearPagesStep, SearchBinding.informQueryChanged({ query })]),
    WikiArticle: ({ kind, handle }) => showWikiArticleStep({ kind, handle }),
    NotFound: () => clearPagesStep,
  })

export const changeRouteStep = (url: Url) => {
  const route = urlToApplicationRoute(url)
  return Update.combineSteps([
    makeFieldsStep(() => ({ route: () => route })),
    enterRouteStep(route),
  ])
}
