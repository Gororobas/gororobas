import { Option } from "effect"
import type { Url } from "foldkit/url"

import { enterRouteStep } from "./change-route"
import { ReadToday, ReplaceUrl, SaveLanguagePreference } from "./command"
import { ApplicationComposition } from "./composition"
import type { Flags } from "./definition"
import { languageRedirectUrl, urlToLocatedRoute } from "./route"

export const init = ApplicationComposition.makeInit((flags: typeof Flags.Type, url: Url) => {
  const { maybeLanguage, route } = urlToLocatedRoute(url)

  return {
    model: {
      route,
      language: flags.language,
      maybeLanguageRequest: Option.none(),
      maybeUnavailableLanguage: flags.maybeUnavailableLanguage,
      languageRequestCount: 0,
      maybeToday: Option.none(),
      maybeWikiArticle: Option.none(),
      maybeWikiArticleDebug: Option.none(),
      maybeProfile: Option.none(),
      maybeProfileEditor: Option.none(),
      maybeExternalDataAdminDashboard: Option.none(),
      isSearchFieldFocusPending: false,
    },
    commands: [
      ReadToday(),
      SaveLanguagePreference({ language: flags.language }),
      ...(Option.isNone(maybeLanguage)
        ? [ReplaceUrl({ url: languageRedirectUrl(flags.language, url) })]
        : []),
    ],
    steps: [enterRouteStep(route)],
  }
})
