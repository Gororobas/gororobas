import { defineInMessageUnion } from "foldkit/message"

/** What the app asks of authentication, through its Binding's `requestRestoreSession` and
 *  `requestSignOut`. */
export const InMessage = defineInMessageUnion({
  RequestedRestoreSession: {},
  /** Signing out from elsewhere, such as the account settings. */
  RequestedSignOut: {},
})

export type InMessage = typeof InMessage.Type
