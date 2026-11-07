import { Effect, Queue, Stream } from "effect"

import { ProfileBlock } from "./definition"
import { Message } from "./message"
import { Collection } from "./model"

/** Starts loading the next page this far before the reader reaches the end of what's loaded. */
const LOAD_AHEAD_MARGIN = "600px"

/** Tells when the reader nears the end of a collection, so its next page loads. */
export const ObserveCollectionEnd = ProfileBlock.makeMountStream("ObserveCollectionEnd", {
  args: { collection: Collection },
  messages: [Message.ReachedCollectionEnd],
  handler: function* () {
    return ({ element, collection }) =>
      Stream.callback<typeof Message.ReachedCollectionEnd.Type>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const observer = new IntersectionObserver(
              (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                  Queue.offerUnsafe(queue, Message.ReachedCollectionEnd({ collection }))
                }
              },
              { rootMargin: LOAD_AHEAD_MARGIN },
            )

            observer.observe(element)
            return observer
          }),
          (observer) => Effect.sync(() => observer.disconnect()),
        ).pipe(Effect.flatMap(() => Effect.never)),
      )
  },
})
