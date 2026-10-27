import { Option } from "effect"
import type { Url } from "foldkit/url"

import { enterRouteStep } from "./change-route"
import { ReadToday } from "./command"
import { ApplicationComposition } from "./composition"
import { urlToApplicationRoute } from "./route"

export const init = ApplicationComposition.makeInit((url: Url) => {
  const route = urlToApplicationRoute(url)

  return {
    model: {
      route,
      maybeToday: Option.none(),
      maybeWikiArticle: Option.none(),
      maybeWikiArticleDebug: Option.none(),
    },
    commands: [ReadToday()],
    steps: [enterRouteStep(route)],
  }
})
