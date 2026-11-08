import {
  InformationVisibility,
  ProfileVisibility,
  SupportedLanguage,
} from "@gororobas/domain/common/enums"
import { AccountDeletionResult, MyAccount } from "@gororobas/domain/people/domain"
import { PersonProfileRow } from "@gororobas/domain/profiles/domain"
import { defineMessageUnion } from "foldkit/message"

import { ClientFailure } from "../../../../lib/client-failure"
import { DeletionBlocker, Setting } from "./model"

export const Message = defineMessageUnion({
  SucceededLoadProfile: { profile: PersonProfileRow },
  FailedLoadProfile: { error: ClientFailure },
  SucceededLoadAccount: { account: MyAccount },
  FailedLoadAccount: { error: ClientFailure },

  ChoseProfileVisibility: { visibility: ProfileVisibility },
  ChoseBookmarksVisibility: { visibility: InformationVisibility },
  ChoseLanguage: { language: SupportedLanguage },
  SucceededSaveSetting: { setting: Setting },
  FailedSaveSetting: { setting: Setting },
  SucceededSaveLanguage: { language: SupportedLanguage },

  ClickedSignOut: {},

  ClickedDeleteAccount: {},
  ConfirmedDeleteOrganizations: {},
  ConfirmedDeleteAccount: {},
  ClickedCancelDeletion: {},
  SucceededRequestAccountDeletion: { result: AccountDeletionResult },
  FailedRequestAccountDeletion: { blocker: DeletionBlocker },
})

export const OutMessage = defineMessageUnion({
  RequestedSignOut: {},
  /** Saved as their language: the app switches to it. */
  ChoseLanguage: { language: SupportedLanguage },
  DeletedAccount: {},
})
