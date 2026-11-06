import { type KeyBinding, streamFromKeyBindings } from "foldkit/dom"

import { ApplicationBlock } from "./definition"
import { Message } from "./message"

/** ⌘K or ⌘L (Ctrl elsewhere), as in browsers and other apps, even while typing in a field. */
const searchShortcuts = ["Mod+K", "Mod+L"].map(
  (keys): KeyBinding<ReturnType<typeof Message.PressedSearchShortcut>> => ({
    keys,
    whileTyping: "Allow",
    mapEvent: () => Message.PressedSearchShortcut(),
  }),
)

export const subscriptions = ApplicationBlock.makeSubscriptions((entry) => ({
  searchShortcut: entry(
    "WatchSearchShortcut",
    {},
    {
      messages: [Message.PressedSearchShortcut],
      modelToDependencies: () => ({}),
      handler: function* () {
        return () => streamFromKeyBindings({ bindings: searchShortcuts })
      },
    },
  ),
}))
