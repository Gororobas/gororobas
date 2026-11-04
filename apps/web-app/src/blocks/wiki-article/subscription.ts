import { Stream } from "effect"

import { streamViewerBookmarks } from "../../lib/viewer-bookmarks"
import { WikiArticleBlock } from "./definition"
import { Message } from "./message"

export const subscriptions = WikiArticleBlock.makeSubscriptions((entry) => ({
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
