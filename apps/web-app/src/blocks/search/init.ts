import { HashMap, Option } from "effect"

import { LoadRecentSearches } from "./command"
import { SearchComposition } from "./composition"
import { ProfileResults, PublicationResults, WikiResults } from "./model"

export const init = SearchComposition.makeInit(() => ({
  model: {
    maybeAnsweredSearch: Option.none(),
    wikiAsyncData: WikiResults.Idle(),
    publicationsAsyncData: PublicationResults.Idle(),
    profilesAsyncData: ProfileResults.Idle(),
    viewerBookmarks: HashMap.empty(),
    recentSearches: [],
  },
  commands: [LoadRecentSearches()],
}))
