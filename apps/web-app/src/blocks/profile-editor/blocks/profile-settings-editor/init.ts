import { ProfileSettingsEditorComposition } from "./composition"
import { Account, AccountDeletion, Profile, SettingSave } from "./model"

export const init = ProfileSettingsEditorComposition.makeInit(() => ({
  model: {
    profile: Profile.Loading(),
    account: Account.Loading(),
    reloadCount: 0,
    save: SettingSave.Idle(),
    deletion: AccountDeletion.Idle(),
  },
}))
