import { defineMessageUnion } from "foldkit/message"

/** What the app tells the editor, through its Binding's `informDeviceLocation`. */
export const InMessage = defineMessageUnion({
  /** The application read the device's position the editor requested. */
  InformedOfDeviceLocation: {},
})
export type InMessage = typeof InMessage.Type
