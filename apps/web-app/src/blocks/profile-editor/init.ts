import { DeviceLocation } from "../../lib/device-location"
import { ProfileEditorComposition } from "./composition"

export const init = ProfileEditorComposition.makeInit(() => ({
  model: { deviceLocation: DeviceLocation.Unrequested() },
}))
