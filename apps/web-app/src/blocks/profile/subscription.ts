import { Stream } from "effect"

import { PhotoGallery } from "../../ui/photo-gallery"
import { ProfileBlock } from "./definition"
import { Message } from "./message"

export const subscriptions = ProfileBlock.makeSubscriptions((entry) => ({
  photoColumnCount: entry(
    "WatchProfilePhotoColumnCount",
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
