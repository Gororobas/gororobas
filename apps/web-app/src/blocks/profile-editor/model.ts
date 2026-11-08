import { Schema } from "effect"

import { DeviceLocation } from "../../lib/device-location"
import { ProfileAboutEditorBlock } from "./blocks/profile-about-editor"
import { ProfileLocationsEditorBlock } from "./blocks/profile-locations-editor"
import { ProfileSettingsEditorBlock } from "./blocks/profile-settings-editor"

export const Model = Schema.Struct({
  /** Read only when the places section asks for it, to find the municipality they're in. */
  deviceLocation: DeviceLocation,
  about: ProfileAboutEditorBlock.Model,
  locations: ProfileLocationsEditorBlock.Model,
  settings: ProfileSettingsEditorBlock.Model,
})

export type Model = typeof Model.Type
