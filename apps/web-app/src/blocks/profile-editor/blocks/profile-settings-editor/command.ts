import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { AccountDeletionConfirmation } from "@gororobas/domain/people/domain"
import { ProfileRowUpdate } from "@gororobas/domain/profiles/domain"
import { Effect, Layer, Option, Predicate, Schema } from "effect"

import { GororobasApiClient } from "../../../../api-client"
import { ProfileSettingsEditorBlock } from "./definition"
import { Message } from "./message"
import { Setting } from "./model"

export const SaveProfileSetting = ProfileSettingsEditorBlock.makeCommand("SaveProfileSetting", {
  args: { setting: Setting, update: ProfileRowUpdate },
  messages: [Message.SucceededSaveSetting, Message.FailedSaveSetting],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ setting, update }) =>
      api.people.updateProfile({ payload: update }).pipe(
        Effect.match({
          onFailure: () => Message.FailedSaveSetting({ setting }),
          onSuccess: () => Message.SucceededSaveSetting({ setting }),
        }),
      )
  },
})

export const SaveLanguage = ProfileSettingsEditorBlock.makeCommand("SaveLanguage", {
  args: { language: SupportedLanguage },
  messages: [Message.SucceededSaveLanguage, Message.FailedSaveSetting],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ language }) =>
      api.people.updateMyAccount({ payload: { preferredLanguage: language } }).pipe(
        Effect.match({
          onFailure: () => Message.FailedSaveSetting({ setting: "Language" }),
          onSuccess: () => Message.SucceededSaveLanguage({ language }),
        }),
      )
  },
})

/** Without a confirmation, only asks what deleting would take with it. */
export const RequestAccountDeletion = ProfileSettingsEditorBlock.makeCommand(
  "RequestAccountDeletion",
  {
    args: { maybeConfirmation: Schema.Option(AccountDeletionConfirmation) },
    messages: [Message.SucceededRequestAccountDeletion, Message.FailedRequestAccountDeletion],
    handler: function* () {
      const api = yield* GororobasApiClient

      return ({ maybeConfirmation }) =>
        api.people
          .deletePerson({
            payload: Option.match(maybeConfirmation, {
              onNone: () => ({}),
              onSome: (confirm) => ({ confirm }),
            }),
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                Message.FailedRequestAccountDeletion({
                  blocker:
                    Predicate.isTagged(error, "AccountDeletionError") &&
                    Predicate.isTagged(error.reason, "SoleOrgManager")
                      ? "SoleOrganizationManager"
                      : Predicate.isTagged(error, "AccountDeletionError")
                        ? "LastAdministrator"
                        : "RequestFailed",
                }),
              onSuccess: (result) => Message.SucceededRequestAccountDeletion({ result }),
            }),
          )
    },
  },
)

export const CommandsLayer = Layer.mergeAll(
  SaveProfileSetting.layer,
  SaveLanguage.layer,
  RequestAccountDeletion.layer,
)
