import { Effect, Schema, Stream } from "effect"

import { GororobasApiClient } from "../../../../api-client"
import { ProfileSettingsEditorBlock } from "./definition"
import { Message } from "./message"

export const subscriptions = ProfileSettingsEditorBlock.makeSubscriptions((entry) => ({
  profile: entry(
    "LoadMyProfile",
    { reloadCount: Schema.Int },
    {
      messages: [Message.SucceededLoadProfile, Message.FailedLoadProfile],
      modelToDependencies: (model) => ({ reloadCount: model.reloadCount }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return () =>
          Stream.fromEffect(
            api.people.getMyProfile().pipe(
              Effect.filterOrFail(
                (profile) => !(profile === null),
                (_profile) => "ProfileMissing",
              ),
              Effect.match({
                onFailure: (error) => Message.FailedLoadProfile({ error: { cause: error } }),
                onSuccess: (profile) => Message.SucceededLoadProfile({ profile }),
              }),
            ),
          )
      },
    },
  ),
  account: entry(
    "LoadMyAccount",
    { reloadCount: Schema.Int },
    {
      messages: [Message.SucceededLoadAccount, Message.FailedLoadAccount],
      modelToDependencies: (model) => ({ reloadCount: model.reloadCount }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return () =>
          Stream.fromEffect(
            api.people.getMyAccount().pipe(
              Effect.match({
                onFailure: (error) => Message.FailedLoadAccount({ error: { cause: error } }),
                onSuccess: (account) => Message.SucceededLoadAccount({ account }),
              }),
            ),
          )
      },
    },
  ),
}))
