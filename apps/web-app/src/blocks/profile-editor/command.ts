import { Effect } from "effect"

import { readDeviceLocation } from "../../lib/device-location"
import { ProfileEditorBlock } from "./definition"
import { Message } from "./message"

/** Asks the browser where the device is, which may prompt the person for permission. */
export const LocateDevice = ProfileEditorBlock.makeCommand("LocateDevice", {
  messages: [Message.CompletedLocateDevice],
  handler: function* () {
    return () =>
      readDeviceLocation.pipe(
        Effect.map((deviceLocation) => Message.CompletedLocateDevice({ deviceLocation })),
      )
  },
})
