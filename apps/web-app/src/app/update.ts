import { Option } from "effect"
import { UrlRequest } from "foldkit/navigation"
import { toString as urlToString } from "foldkit/url"

import { changeRouteStep } from "./change-route"
import { LoadExternal, NavigateInternal } from "./command"
import { ApplicationComposition } from "./composition"
import { makeFieldsStep, makeNoopStep } from "./definition"

export const update = ApplicationComposition.makeUpdate({
  ClickedLink: (model, { request }) =>
    UrlRequest.match(request, {
      Internal: ({ url }) => ({ model, commands: [NavigateInternal({ url: urlToString(url) })] }),
      External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
    }),
  ChangedUrl: (model, { url }) => changeRouteStep(url)(model),
  CompletedNavigateInternal: makeNoopStep(),
  CompletedLoadExternal: makeNoopStep(),
  CompletedReadToday: makeFieldsStep.fromMessage(({ today }) => ({
    maybeToday: () => Option.some(today),
  })),
})
