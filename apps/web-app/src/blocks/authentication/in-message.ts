import { defineMessageUnion } from "foldkit/message"

/** What the app asks of authentication, through its Binding's `requestRestoreSession`. */
export const InMessage = defineMessageUnion({
  RequestedRestoreSession: {},
})
export type InMessage = typeof InMessage.Type
