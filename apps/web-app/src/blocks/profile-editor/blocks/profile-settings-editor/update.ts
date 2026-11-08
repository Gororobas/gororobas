import { Array as EffectArray, Match, Option, Predicate } from "effect"
import { AsyncData } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { RequestAccountDeletion, SaveLanguage, SaveProfileSetting } from "./command"
import { ProfileSettingsEditorComposition } from "./composition"
import { OutMessage } from "./message"
import { Account, AccountDeletion, type Model, Profile, SettingSave } from "./model"

const isSaving = (model: Model) => SettingSave.guards.Saving(model.save)

const deletionStep = (model: Model, deletion: AccountDeletion) =>
  modifyFields(model, { deletion: () => deletion })

export const update = ProfileSettingsEditorComposition.makeUpdate({
  SucceededLoadProfile: (model, { profile }) => ({
    model: modifyFields(model, { profile: () => Profile.Success({ data: profile }) }),
  }),
  FailedLoadProfile: (model, { error }) => ({
    model: modifyFields(model, { profile: () => Profile.Failure({ error }) }),
  }),
  SucceededLoadAccount: (model, { account }) => ({
    model: modifyFields(model, { account: () => Account.Success({ data: account }) }),
  }),
  FailedLoadAccount: (model, { error }) => ({
    model: modifyFields(model, { account: () => Account.Failure({ error }) }),
  }),

  ChoseProfileVisibility: (model, { visibility }) =>
    Option.match(AsyncData.getData(model.profile), {
      onNone: () => ({ model }),
      onSome: (profile) =>
        isSaving(model) || profile.visibility === visibility
          ? { model }
          : {
              model: modifyFields(model, {
                profile: () => Profile.Success({ data: { ...profile, visibility } }),
                save: () => SettingSave.Saving({ setting: "ProfileVisibility" }),
              }),
              commands: [
                SaveProfileSetting({ setting: "ProfileVisibility", update: { visibility } }),
              ],
            },
    }),
  ChoseBookmarksVisibility: (model, { visibility }) =>
    Option.match(AsyncData.getData(model.profile), {
      onNone: () => ({ model }),
      onSome: (profile) =>
        isSaving(model) || profile.bookmarksVisibility === visibility
          ? { model }
          : {
              model: modifyFields(model, {
                profile: () =>
                  Profile.Success({ data: { ...profile, bookmarksVisibility: visibility } }),
                save: () => SettingSave.Saving({ setting: "BookmarksVisibility" }),
              }),
              commands: [
                SaveProfileSetting({
                  setting: "BookmarksVisibility",
                  update: { bookmarksVisibility: visibility },
                }),
              ],
            },
    }),
  ChoseLanguage: (model, { language }) =>
    Option.match(AsyncData.getData(model.account), {
      onNone: () => ({ model }),
      onSome: (account) =>
        isSaving(model) || account.preferredLanguage === language
          ? { model }
          : {
              model: modifyFields(model, {
                account: () =>
                  Account.Success({ data: { ...account, preferredLanguage: language } }),
                save: () => SettingSave.Saving({ setting: "Language" }),
              }),
              commands: [SaveLanguage({ language })],
            },
    }),
  SucceededSaveSetting: (model, { setting }) => ({
    model: modifyFields(model, { save: () => SettingSave.Saved({ setting }) }),
  }),
  SucceededSaveLanguage: (model, { language }) => ({
    model: modifyFields(model, { save: () => SettingSave.Saved({ setting: "Language" }) }),
    outMessage: OutMessage.ChoseLanguage({ language }),
  }),
  FailedSaveSetting: (model, { setting }) => ({
    model: modifyFields(model, {
      save: () => SettingSave.Failed({ setting }),
      reloadCount: (count) => count + 1,
    }),
  }),

  ClickedSignOut: (model) => ({ model, outMessage: OutMessage.RequestedSignOut() }),

  ClickedDeleteAccount: (model) =>
    AccountDeletion.guards.Idle(model.deletion) || AccountDeletion.guards.Blocked(model.deletion)
      ? {
          model: deletionStep(model, AccountDeletion.Asking({ organizationIds: [] })),
          commands: [RequestAccountDeletion({ maybeConfirmation: Option.none() })],
        }
      : { model },
  ConfirmedDeleteOrganizations: (model) => {
    if (!AccountDeletion.guards.ConfirmingOrganizations(model.deletion)) return { model }
    const organizationIds = model.deletion.organizations.map(({ organizationId }) => organizationId)

    return {
      model: deletionStep(model, AccountDeletion.Asking({ organizationIds })),
      commands: [RequestAccountDeletion({ maybeConfirmation: Option.some({ organizationIds }) })],
    }
  },
  ConfirmedDeleteAccount: (model) => {
    if (!AccountDeletion.guards.ConfirmingContent(model.deletion)) return { model }
    const { scope } = model.deletion

    return {
      model: deletionStep(model, AccountDeletion.Deleting({ scope })),
      commands: [
        RequestAccountDeletion({
          maybeConfirmation: Option.some({
            organizationIds: scope.organizations.map(({ organizationId }) => organizationId),
            scope,
          }),
        }),
      ],
    }
  },
  ClickedCancelDeletion: (model) => ({ model: deletionStep(model, AccountDeletion.Idle()) }),
  SucceededRequestAccountDeletion: (model, { result }) => {
    // Asked again after confirming: what they reviewed changed in the meantime.
    const hasChanged =
      AccountDeletion.guards.Deleting(model.deletion) ||
      (AccountDeletion.guards.Asking(model.deletion) &&
        EffectArray.isReadonlyArrayNonEmpty(model.deletion.organizationIds) &&
        Predicate.isTagged(result, "ConfirmOrgDeletion"))

    return Match.value(result).pipe(
      Match.tagsExhaustive({
        ConfirmOrgDeletion: ({ organizations }) => ({
          model: deletionStep(
            model,
            AccountDeletion.ConfirmingOrganizations({ organizations, hasChanged }),
          ),
        }),
        ConfirmContentDeletion: ({ personalContent, organizations }) => ({
          model: deletionStep(
            model,
            AccountDeletion.ConfirmingContent({
              scope: { personalContent, organizations },
              hasChanged,
            }),
          ),
        }),
        Success: () => ({ model, outMessage: OutMessage.DeletedAccount() }),
      }),
    )
  },
  FailedRequestAccountDeletion: (model, { blocker }) => ({
    model: deletionStep(model, AccountDeletion.Blocked({ blocker })),
  }),
})
