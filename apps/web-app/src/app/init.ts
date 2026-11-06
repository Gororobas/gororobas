import { Option } from "effect"
import type { Url } from "foldkit/url"

import { DeviceLocation } from "../lib/device-location"
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
      deviceLocation: DeviceLocation.Unrequested(),
      maybeWikiArticle: Option.none(),
      maybeWikiArticleDebug: Option.none(),
      maybeProfile: Option.none(),
      maybeProfileLocationsEditor: Option.none(),
      maybeExternalDataAdminDashboard: Option.none(),
      isSearchFieldFocusPending: false,
    },
    commands: [ReadToday()],
    steps: [enterRouteStep(route)],
  }
})
