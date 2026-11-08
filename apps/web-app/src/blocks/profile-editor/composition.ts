import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { DeviceLocation } from "../../lib/device-location"
import { ProfileAboutEditorBlock } from "./blocks/profile-about-editor"
import { ProfileLocationsEditorBlock } from "./blocks/profile-locations-editor"
import { ProfileSettingsEditorBlock } from "./blocks/profile-settings-editor"
import { LocateDevice } from "./command"
import { ProfileEditorBlock } from "./definition"
import { OutMessage } from "./message"

export const AboutBinding = ProfileEditorBlock.makeRequiredFieldBinding(ProfileAboutEditorBlock, {
  field: "about",
})

export const LocationsBinding = ProfileEditorBlock.makeRequiredFieldBinding(
  ProfileLocationsEditorBlock,
  {
    field: "locations",
    delivery: { toUpdateContext: (model) => [model.deviceLocation] },
  },
).withOutMessagePolicy({
  fold: ProfileEditorBlock.makeOutMessageFold(ProfileLocationsEditorBlock, {
    RequestedDeviceLocation: () =>
      ProfileEditorBlock.makeStep((model) => ({
        model: modifyFields(model, { deviceLocation: () => DeviceLocation.Locating() }),
        commands: [LocateDevice()],
      })),
  }),
})

export const SettingsBinding = ProfileEditorBlock.makeRequiredFieldBinding(
  ProfileSettingsEditorBlock,
  {
    field: "settings",
  },
).withOutMessagePolicy({
  forward: ProfileEditorBlock.makeOutMessageForward({
    RequestedSignOut: () => OutMessage.RequestedSignOut(),
    ChoseLanguage: ({ language }) => OutMessage.ChoseLanguage({ language }),
    DeletedAccount: () => OutMessage.DeletedAccount(),
  }),
})

export const ProfileEditorComposition = ProfileEditorBlock.makeComposition({
  bindings: [AboutBinding, LocationsBinding, SettingsBinding],
})
export type ProfileEditorViewBuilder = Block.ViewBuilderFor<typeof ProfileEditorComposition>
