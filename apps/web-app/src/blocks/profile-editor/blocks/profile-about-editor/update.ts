import { Option, Result } from "effect"
import { AsyncData } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { ChoosePhoto, SaveProfile } from "./command"
import { ProfileAboutEditorComposition } from "./composition"
import { changesOf, formFromProfile, handleCheckFor, normalizeHandle } from "./form"
import { type Form, HandleCheck, type Model, Profile, SaveStatus } from "./model"

/** Any edit makes the last save's outcome stale. */
const editForm = (model: Model, edit: (form: Form) => Form) =>
  modifyFields(model, {
    form: edit,
    save: (save) => (SaveStatus.guards.Saving(save) ? save : SaveStatus.Idle()),
  })

export const update = ProfileAboutEditorComposition.makeUpdate({
  SucceededLoadProfile: (model, { profile }) => ({
    model: modifyFields(model, {
      profile: () => Profile.Success({ data: profile }),
      form: () => formFromProfile(profile),
      handleCheck: () => HandleCheck.Unchanged(),
    }),
  }),
  FailedLoadProfile: (model, { error }) => ({
    model: modifyFields(model, { profile: () => Profile.Failure({ error }) }),
  }),

  UpdatedName: (model, { value }) => ({
    model: editForm(model, (form) => ({ ...form, name: value })),
  }),
  UpdatedBio: (model, { value }) => ({
    model: editForm(model, (form) => ({ ...form, bio: value })),
  }),
  UpdatedHandle: (model, { value }) => {
    const handle = normalizeHandle(value)

    return {
      model: modifyFields(
        editForm(model, (form) => ({ ...form, handle })),
        {
          handleCheck: (current) =>
            Option.match(AsyncData.getData(model.profile), {
              onNone: () => current,
              onSome: (profile) => handleCheckFor(profile, handle),
            }),
        },
      ),
    }
  },
  // Answers for a handle that's no longer typed are stale.
  SucceededCheckHandle: (model, { handle, isAvailable }) =>
    handle === model.form.handle && HandleCheck.guards.Checking(model.handleCheck)
      ? {
          model: modifyFields(model, {
            handleCheck: () => (isAvailable ? HandleCheck.Available() : HandleCheck.Taken()),
          }),
        }
      : { model },
  FailedCheckHandle: (model, { handle }) =>
    handle === model.form.handle && HandleCheck.guards.Checking(model.handleCheck)
      ? { model: modifyFields(model, { handleCheck: () => HandleCheck.Unknown() }) }
      : { model },

  ClickedChoosePhoto: (model) =>
    model.photoUpload === "Uploading"
      ? { model }
      : {
          model: modifyFields(model, { photoUpload: () => "Uploading" }),
          commands: [ChoosePhoto()],
        },
  CancelledChoosePhoto: (model) => ({
    model: modifyFields(model, { photoUpload: () => "Idle" }),
  }),
  SucceededUploadPhoto: (model, { id }) => ({
    model: modifyFields(
      editForm(model, (form) => ({ ...form, maybePhotoId: Option.some(id) })),
      { photoUpload: () => "Idle" },
    ),
  }),
  FailedUploadPhoto: (model) => ({
    model: modifyFields(model, { photoUpload: () => "Failed" }),
  }),
  ClickedRemovePhoto: (model) => ({
    model: editForm(model, (form) => ({ ...form, maybePhotoId: Option.none() })),
  }),

  SubmittedForm: (model) => {
    if (SaveStatus.guards.Saving(model.save) || HandleCheck.guards.Taken(model.handleCheck)) {
      return { model }
    }

    return Option.match(AsyncData.getData(model.profile), {
      onNone: () => ({ model }),
      onSome: (profile) =>
        Result.match(changesOf(profile, model.form), {
          onFailure: (error) => ({
            model: modifyFields(model, { save: () => SaveStatus.Failed({ error }) }),
          }),
          onSuccess: (update) => ({
            model: modifyFields(model, { save: () => SaveStatus.Saving() }),
            commands: [SaveProfile({ update })],
          }),
        }),
    })
  },
  ClickedDiscardChanges: (model) =>
    Option.match(AsyncData.getData(model.profile), {
      onNone: () => ({ model }),
      onSome: (profile) => ({
        model: modifyFields(model, {
          form: () => formFromProfile(profile),
          handleCheck: () => HandleCheck.Unchanged(),
          photoUpload: () => "Idle",
          save: () => SaveStatus.Idle(),
        }),
      }),
    }),
  SucceededSaveProfile: (model) => ({
    model: modifyFields(model, {
      save: () => SaveStatus.Saved(),
      reloadCount: (count) => count + 1,
    }),
  }),
  FailedSaveProfile: (model, { error }) => ({
    model: modifyFields(model, {
      save: () => SaveStatus.Failed({ error }),
      handleCheck: (current) => (error === "HandleTaken" ? HandleCheck.Taken() : current),
    }),
  }),
})
