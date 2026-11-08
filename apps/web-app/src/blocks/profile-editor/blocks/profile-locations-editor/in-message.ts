import { defineInMessageUnion } from "foldkit/message"

/** What the profile editor tells it, through its Binding's `informOfDeviceLocation`. */
export const InMessage = defineInMessageUnion({
  /** The profile editor read the device's position this editor requested. */
  InformedOfDeviceLocation: {},
})
export type InMessage = typeof InMessage.Type
