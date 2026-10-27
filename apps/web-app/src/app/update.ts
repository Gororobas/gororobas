import { Option } from "effect"
import { Update } from "foldkit"
import { UrlRequest } from "foldkit/navigation"
import { toString as urlToString } from "foldkit/url"

import { changeRouteStep } from "./change-route"
import { LoadExternal, NavigateInternal } from "./command"
import { ApplicationComposition, SearchBinding } from "./composition"
import { makeCommandsStep, makeFieldsStep, makeNoopStep } from "./definition"
import { ApplicationRoute, searchQueryOf, urlToApplicationRoute } from "./route"

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
  ChangedUrl: (model, { url }) => changeRouteStep(url)(model),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedReadToday: makeFieldsStep.fromMessage(({ today }) => ({
    maybeToday: () => Option.some(today),
  })),
})
