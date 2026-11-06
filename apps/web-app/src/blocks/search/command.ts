import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Effect, Layer, Match } from "effect"
import { pushUrl, replaceUrl } from "foldkit/navigation"

import { SearchQuery, searchUrl } from "../../app/route"
import { RecentSearches, RecentSearchesStore } from "../../lib/recent-searches"
import { SearchBlock } from "./definition"
import { Message, Navigation } from "./message"

export const NavigateSearch = SearchBlock.makeCommand("NavigateSearch", {
  args: { language: SupportedLanguage, query: SearchQuery, navigation: Navigation },
  messages: [Message.CompletedNavigateSearch],
  handler: function* () {
    return ({ language, query, navigation }) =>
      Match.value(navigation).pipe(
        Match.when("Replace", () => replaceUrl(searchUrl(language, query))),
        Match.when("Push", () => pushUrl(searchUrl(language, query))),
        Match.exhaustive,
        Effect.as(Message.CompletedNavigateSearch()),
      )
  },
})

export const LoadRecentSearches = SearchBlock.makeCommand("LoadRecentSearches", {
  messages: [Message.SucceededLoadRecentSearches],
  handler: function* () {
    const store = yield* RecentSearchesStore
    return () =>
      store.read.pipe(
        Effect.map((recentSearches) => Message.SucceededLoadRecentSearches({ recentSearches })),
      )
  },
})

export const SaveRecentSearches = SearchBlock.makeCommand("SaveRecentSearches", {
  args: { recentSearches: RecentSearches },
  messages: [Message.CompletedSaveRecentSearches],
  handler: function* () {
    const store = yield* RecentSearchesStore
    return ({ recentSearches }) =>
      store.write(recentSearches).pipe(Effect.as(Message.CompletedSaveRecentSearches()))
  },
})

export const CommandsLayer = Layer.mergeAll(
  NavigateSearch.layer,
  LoadRecentSearches.layer,
  SaveRecentSearches.layer,
)
