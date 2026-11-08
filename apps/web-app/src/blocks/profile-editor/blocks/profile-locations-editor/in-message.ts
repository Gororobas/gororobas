import { defineMessageUnion } from "foldkit/message"

/** What the profile editor tells it, through its Binding's `informDeviceLocation`. */
export const InMessage = defineMessageUnion({
  /** The profile editor read the device's position this editor requested. */
  InformedOfDeviceLocation: {},
})
export type InMessage = typeof InMessage.Type
