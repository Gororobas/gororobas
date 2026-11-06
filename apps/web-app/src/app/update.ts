import { Option } from "effect"
import { Update } from "foldkit"
import { UrlRequest } from "foldkit/navigation"
import { modifyFields } from "foldkit/struct"
import { toString as urlToString } from "foldkit/url"

import { changeRouteStep } from "./change-route"
import { FocusSearchField, LoadExternal, NavigateInternal, SaveLanguagePreference } from "./command"
import { ApplicationComposition, ProfileLocationsEditorBinding, SearchBinding } from "./composition"
import { makeCommandsStep, makeFieldsStep, makeNoopStep } from "./definition"
import { ApplicationRoute, searchQueryOf, searchUrl, urlToLocatedRoute } from "./route"

export const update = ApplicationComposition.makeUpdate({
  ClickedLink: (model, { request }) =>
    UrlRequest.match(request, {
      Internal: ({ url }) => {
        const navigate = makeCommandsStep(() => [NavigateInternal({ url: urlToString(url) })])

        const { route } = model

        // Opening a result is what makes a search worth remembering.
        const rememberSearch =
          ApplicationRoute.guards.Search(route) &&
          !ApplicationRoute.guards.Search(urlToLocatedRoute(url).route)
            ? [SearchBinding.informOpenedResult({ query: searchQueryOf(route) })]
            : []

        return Update.combineSteps([navigate, ...rememberSearch])(model)
      },
      External: ({ href }) =>
        Update.combineSteps([makeCommandsStep(() => [LoadExternal({ href })])])(model),
    }),
  ClickedSearchLink: makeFieldsStep(() => ({ isSearchFieldFocusPending: () => true })),
  /** Focuses search where it is, or opens it with its field focused. */
  PressedSearchShortcut: (model) =>
    ApplicationRoute.guards.Search(model.route)
      ? { model, commands: [FocusSearchField()] }
      : {
          model: modifyFields(model, { isSearchFieldFocusPending: () => true }),
          commands: [NavigateInternal({ url: searchUrl(model.language) })],
        },
  ChangedUrl: (model, { url }) => changeRouteStep(url)(model),
  CompletedFocusSearchField: makeNoopStep(),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedReadToday: makeFieldsStep.fromMessage(({ today }) => ({
    maybeToday: () => Option.some(today),
  })),
  CompletedReplaceUrl: makeNoopStep(),
  CompletedSaveLanguagePreference: makeNoopStep(),
  /** A slower, earlier request finishing after a newer one must not switch the app back. */
  CompletedLoadTranslations: (model, { language, requestNumber }) =>
    Option.exists(model.maybeLanguageRequest, (request) => request.number === requestNumber)
      ? {
          model: modifyFields(model, {
            language: () => language,
            maybeLanguageRequest: () => Option.none(),
          }),
          commands: [SaveLanguagePreference({ language })],
        }
      : { model },
  /** The app stays readable in its current language; following a language link again retries. */
  FailedLoadTranslations: (model, { requestNumber }) =>
    Option.exists(model.maybeLanguageRequest, (request) => request.number === requestNumber)
      ? { model: modifyFields(model, { maybeLanguageRequest: () => Option.none() }) }
      : { model },
  CompletedLocateDevice: (model, { deviceLocation }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ deviceLocation: () => deviceLocation })),
      ProfileLocationsEditorBinding.informDeviceLocation(deviceLocation),
    ])(model),
})
