import { Stream } from "effect"

import { streamViewerBookmarks } from "../../lib/viewer-bookmarks"
import { WikiArticleDefinition } from "./definition"
import { Message } from "./message"

export const subscriptions = WikiArticleDefinition.makeSubscriptions((entry) => ({
  viewerBookmarks: entry(
    "WatchViewerBookmarks",
    {},
    {
      messages: [Message.UpdatedViewerBookmarks],
      modelToDependencies: () => ({}),
      handler: function* () {
        return () =>
          streamViewerBookmarks.pipe(
            Stream.map((bookmarks) => Message.UpdatedViewerBookmarks({ bookmarks })),
            Stream.catchCause(() => Stream.empty),
          )
      },
    },
  ),
}))
