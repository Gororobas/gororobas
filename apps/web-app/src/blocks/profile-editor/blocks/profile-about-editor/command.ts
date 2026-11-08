import { ProfileRowUpdate } from "@gororobas/domain/profiles/domain"
import { Effect, Layer, Option, Predicate } from "effect"
import * as File from "foldkit/file"

import { GororobasApiClient } from "../../../../api-client"
import { SessionAccess } from "../../../../session-access"
import { ProfileAboutEditorBlock } from "./definition"
import { Message } from "./message"

type ChoosePhotoResult =
  | typeof Message.CancelledChoosePhoto.Type
  | typeof Message.SucceededUploadPhoto.Type
  | typeof Message.FailedUploadPhoto.Type

/** Picks an image and uploads it; the photo only becomes theirs once the form is saved. */
export const ChoosePhoto = ProfileAboutEditorBlock.makeCommand("ChoosePhoto", {
  messages: [Message.CancelledChoosePhoto, Message.SucceededUploadPhoto, Message.FailedUploadPhoto],
  handler: function* () {
    const api = yield* GororobasApiClient

    const uploadPhoto = (file: globalThis.File) => {
      const form = new FormData()
      form.append("file", file, file.name)

      return api.mediaAssets.uploadMedia({ payload: form }).pipe(
        Effect.match({
          onFailure: () => Message.FailedUploadPhoto(),
          onSuccess: ({ id }) => Message.SucceededUploadPhoto({ id }),
        }),
      )
    }

    return () =>
      File.select(["image/*"]).pipe(
        Effect.flatMap((maybeFile): Effect.Effect<ChoosePhotoResult> =>
          Option.isSome(maybeFile)
            ? uploadPhoto(maybeFile.value)
            : Effect.succeed(Message.CancelledChoosePhoto()),
        ),
      )
  },
})

export const SaveProfile = ProfileAboutEditorBlock.makeCommand("SaveProfile", {
  args: { update: ProfileRowUpdate },
  messages: [Message.SucceededSaveProfile, Message.FailedSaveProfile],
  handler: function* () {
    const api = yield* GororobasApiClient
    const access = yield* SessionAccess

    return ({ update }) =>
      api.people.updateProfile({ payload: update }).pipe(
        // The app bar shows their name from the session kept on this device.
        Effect.tap(() => (update.name === undefined ? Effect.void : access.setName(update.name))),
        Effect.match({
          onFailure: (error: { readonly _tag: string }) =>
            Message.FailedSaveProfile({
              error: Predicate.isTagged(error, "HandleTakenError")
                ? "HandleTaken"
                : Predicate.isTagged(error, "InvalidMediaAssetError")
                  ? "PhotoInvalid"
                  : "SaveFailed",
            }),
          onSuccess: () => Message.SucceededSaveProfile(),
        }),
      )
  },
})

export const CommandsLayer = Layer.mergeAll(ChoosePhoto.layer, SaveProfile.layer)
