import { Option } from "effect"
import { Update } from "foldkit"
import { UrlRequest } from "foldkit/navigation"
import { modifyFields } from "foldkit/struct"
import { toString as urlToString } from "foldkit/url"

import { changeRouteStep, settleLanguageRequestStep } from "./change-route"
import { FocusSearchField, LoadExternal, NavigateInternal } from "./command"
import {
  ApplicationComposition,
  ProfileLocationsEditorBinding,
  SearchBinding,
  SettingsMenuBinding,
} from "./composition"
import { makeCommandsStep, makeFieldsStep, makeNoopStep } from "./definition"
import { ApplicationRoute, searchUrl, urlToLocatedRoute } from "./route"

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
            ? [SearchBinding.informOpenedResult({ query: route.query })]
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
  // Choosing a language, or the account, navigates: the menu closes behind it.
  ChangedUrl: (model, { url }) =>
    Update.combineSteps([SettingsMenuBinding.requestClose(), changeRouteStep(url)])(model),
  CompletedFocusSearchField: makeNoopStep(),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedReadToday: makeFieldsStep.fromMessage(({ today }) => ({
    maybeToday: () => Option.some(today),
  })),
  CompletedReplaceUrl: makeNoopStep(),
  CompletedSaveLanguagePreference: makeNoopStep(),
  CompletedLoadTranslations: (model, { language, requestNumber }) =>
    settleLanguageRequestStep({ requestNumber, maybeLoadedLanguage: Option.some(language) })(model),
  FailedLoadTranslations: (model, { requestNumber }) =>
    settleLanguageRequestStep({ requestNumber, maybeLoadedLanguage: Option.none() })(model),
  CompletedLocateDevice: (model, { deviceLocation }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ deviceLocation: () => deviceLocation })),
      ProfileLocationsEditorBinding.informDeviceLocation(deviceLocation),
    ])(model),
})
