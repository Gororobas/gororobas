import { Effect, Layer, Match } from "effect"
import { pushUrl, replaceUrl } from "foldkit/navigation"

import { SearchQuery, searchUrl } from "../../app/route"
import { SearchDefinition } from "./definition"
import { Message, Navigation } from "./message"

export const NavigateSearch = SearchDefinition.makeCommand("NavigateSearch", {
  args: { query: SearchQuery, navigation: Navigation },
  messages: [Message.CompletedNavigateSearch],
  handler: function* () {
    return ({ query, navigation }) =>
      Match.value(navigation)
        .pipe(
          Match.when("Replace", () => replaceUrl(searchUrl(query))),
          Match.when("Push", () => pushUrl(searchUrl(query))),
          Match.exhaustive,
        )
        .pipe(Effect.as(Message.CompletedNavigateSearch()))
  },
})

export const CommandsLayer = Layer.mergeAll(NavigateSearch.layer)
