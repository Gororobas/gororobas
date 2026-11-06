import { Option } from "effect"
import { Update } from "foldkit"
import { UrlRequest } from "foldkit/navigation"
import { modifyFields } from "foldkit/struct"
import { toString as urlToString } from "foldkit/url"

import { changeRouteStep } from "./change-route"
import { FocusSearchField, LoadExternal, NavigateInternal } from "./command"
import { ApplicationComposition, ProfileLocationsEditorBinding, SearchBinding } from "./composition"
import { makeCommandsStep, makeFieldsStep, makeNoopStep } from "./definition"
import { ApplicationRoute, searchQueryOf, searchUrl, urlToApplicationRoute } from "./route"

export const update = ApplicationComposition.makeUpdate({
  ClickedLink: (model, { request }) =>
    UrlRequest.match(request, {
      Internal: ({ url }) => {
        const navigate = makeCommandsStep(() => [NavigateInternal({ url: urlToString(url) })])

        const { route } = model

        // Opening a result is what makes a search worth remembering.
        const rememberSearch =
          ApplicationRoute.guards.Search(route) &&
          !ApplicationRoute.guards.Search(urlToApplicationRoute(url))
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
          commands: [NavigateInternal({ url: searchUrl() })],
        },
  ChangedUrl: (model, { url }) => changeRouteStep(url)(model),
  CompletedFocusSearchField: makeNoopStep(),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedReadToday: makeFieldsStep.fromMessage(({ today }) => ({
    maybeToday: () => Option.some(today),
  })),
  CompletedLocateDevice: (model, { deviceLocation }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ deviceLocation: () => deviceLocation })),
      ProfileLocationsEditorBinding.informDeviceLocation(deviceLocation),
    ])(model),
})
