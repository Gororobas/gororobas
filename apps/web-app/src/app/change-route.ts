import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { Handle } from "@gororobas/domain/common/primitives"
import type { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Array as EffectArray, Option } from "effect"
import { Update } from "foldkit"
import { modifyFields } from "foldkit/struct"
import type { Url } from "foldkit/url"

import { FocusSearchField, LoadTranslations, ReplaceUrl, SaveLanguagePreference } from "./command"
import {
  AuthenticationBinding,
  ExternalDataAdminDashboardBinding,
  ProfileBinding,
  ProfileLocationsEditorBinding,
  SearchBinding,
  WikiArticleBinding,
  WikiArticleDebugBinding,
  profileKey,
  wikiArticleKey,
} from "./composition"
import { makeCommandsStep, makeFieldsStep, makeNoopStep, makeStep } from "./definition"
import {
  ApplicationRoute,
  type ObservationLogQuery,
  languageRedirectUrl,
  observationLogQueryKey,
  observationLogQueryOf,
  urlToLocatedRoute,
} from "./route"

const clearPagesStep = makeFieldsStep(() => ({
  maybeWikiArticle: () => Option.none(),
  maybeWikiArticleDebug: () => Option.none(),
  maybeProfile: () => Option.none(),
  maybeProfileLocationsEditor: () => Option.none(),
  maybeExternalDataAdminDashboard: () => Option.none(),
}))

/** Each filter combination is its own URL, so the log loads afresh when one changes. */
const showExternalDataAdminDashboardStep = (query: ObservationLogQuery) => {
  const queryKey = observationLogQueryKey(query)

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
              maybeProfile: () => Option.none(),
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
        maybeProfile: () => Option.none(),
        maybeProfileLocationsEditor: () => Option.some(child),
      }),
  }),
)

const showWikiArticleStep = (lookup: Readonly<{ kind: WikiArticleKind; handle: Handle }>) =>
  makeStep((model) => {
    const articleKey = wikiArticleKey(model.language, lookup)

    return Option.exists(model.maybeWikiArticle, (article) => article.articleKey === articleKey)
      ? { model }
      : WikiArticleBinding.init({
          key: articleKey,
          args: [{ kind: lookup.kind, handle: lookup.handle }, model.language],
          toParentModel: (child) =>
            modifyFields(model, {
              maybeWikiArticle: () => Option.some({ articleKey, model: child }),
              maybeWikiArticleDebug: () => Option.none(),
              maybeProfile: () => Option.none(),
            }),
        })
  })

const showProfileStep = (handle: Handle) =>
  makeStep((model) => {
    const key = profileKey(model.language, handle)

    return Option.exists(model.maybeProfile, (profile) => profile.profileKey === key)
      ? { model }
      : ProfileBinding.init({
          key,
          args: [handle, model.language],
          toParentModel: (child) =>
            modifyFields(model, {
              maybeWikiArticle: () => Option.none(),
              maybeWikiArticleDebug: () => Option.none(),
              maybeProfile: () => Option.some({ profileKey: key, model: child }),
            }),
        })
  })

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
              maybeProfile: () => Option.none(),
            }),
        }),
  )

/**
 * Prepares the page a route shows in the app's language, keeping it when the route still shows the
 * same one.
 */
export const enterRouteStep = (route: ApplicationRoute) =>
  ApplicationRoute.match(route, {
    WikiArticleDebug: ({ wikiArticleId }) => showWikiArticleDebugStep(wikiArticleId),
    Login: () =>
      Update.combineSteps([clearPagesStep, AuthenticationBinding.requestRestoreSession()]),
    Search: ({ query }) =>
      Update.combineSteps([
        clearPagesStep,
        makeStep((model) =>
          SearchBinding.informQueryChange({ search: { query, language: model.language } }),
        ),
      ]),
    WikiArticle: ({ kind, handle }) => showWikiArticleStep({ kind, handle }),
    Profile: ({ handle }) => showProfileStep(handle),
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

/**
 * The app keeps rendering its current language until the URL's has loaded. Content then loads in
 * the new language, so pages enter their route once the request settles, not before.
 */
const requestLanguageStep = (language: SupportedLanguage) =>
  makeStep((model) => {
    if (language === model.language) {
      return { model: modifyFields(model, { maybeLanguageRequest: () => Option.none() }) }
    }

    if (Option.exists(model.maybeLanguageRequest, (request) => request.language === language)) {
      return { model }
    }

    const requestNumber = model.languageRequestCount + 1

    return {
      model: modifyFields(model, {
        languageRequestCount: () => requestNumber,
        maybeLanguageRequest: () => Option.some({ language, number: requestNumber }),
      }),
      commands: [LoadTranslations({ language, requestNumber })],
    }
  })

/**
 * Settles the latest language request, entering the route it held back. A slower, earlier request
 * finishing after a newer one must not switch the app back, and a failed one leaves the app readable
 * in its current language: following a language link again retries.
 */
export const settleLanguageRequestStep = ({
  requestNumber,
  maybeLoadedLanguage,
}: Readonly<{ requestNumber: number; maybeLoadedLanguage: Option.Option<SupportedLanguage> }>) =>
  makeStep((model) =>
    Option.exists(model.maybeLanguageRequest, (request) => request.number === requestNumber)
      ? Update.combineSteps([
          makeFieldsStep(() => ({
            language: (current) => Option.getOrElse(maybeLoadedLanguage, () => current),
            maybeLanguageRequest: () => Option.none(),
            maybeUnavailableLanguage: () =>
              Option.isSome(maybeLoadedLanguage)
                ? Option.none()
                : Option.map(model.maybeLanguageRequest, (request) => request.language),
          })),
          makeCommandsStep(() =>
            EffectArray.fromOption(
              Option.map(maybeLoadedLanguage, (language) => SaveLanguagePreference({ language })),
            ),
          ),
          enterRouteStep(model.route),
        ])
      : makeNoopStep(),
  )

/** Enters the route unless its language is still loading, which enters it when it settles. */
const enterRouteUnlessLoadingStep = (route: ApplicationRoute) =>
  makeStep((model) =>
    Option.isSome(model.maybeLanguageRequest) ? makeNoopStep() : enterRouteStep(route),
  )

export const changeRouteStep = (url: Url) => {
  const { maybeLanguage, route } = urlToLocatedRoute(url)

  return Option.match(maybeLanguage, {
    onNone: () =>
      makeCommandsStep((model) => [ReplaceUrl({ url: languageRedirectUrl(model.language, url) })]),
    onSome: (language) =>
      Update.combineSteps([
        makeFieldsStep(() => ({ route: () => route })),
        requestLanguageStep(language),
        enterRouteUnlessLoadingStep(route),
        consumeSearchFieldFocusStep(route),
      ]),
  })
}
