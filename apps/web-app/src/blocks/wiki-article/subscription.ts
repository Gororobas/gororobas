import { Stream } from "effect"

import { streamViewerBookmarks } from "../../lib/viewer-bookmarks"
import { PhotoGallery } from "../../ui/photo-gallery"
import { WikiArticleBlock } from "./definition"
import { Message } from "./message"

export const subscriptions = WikiArticleBlock.makeSubscriptions((entry) => ({
  viewerBookmarks: entry(
    "WatchWikiArticleViewerBookmarks",
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
  photoColumnCount: entry(
    "WatchPhotoColumnCount",
    {},
    {
      messages: [Message.ChangedPhotoColumnCount],
      modelToDependencies: () => ({}),
      handler: function* () {
        return () =>
          PhotoGallery.streamColumnCount.pipe(
            Stream.map((columnCount) => Message.ChangedPhotoColumnCount({ columnCount })),
          )
      },
    },
  ),
}))
