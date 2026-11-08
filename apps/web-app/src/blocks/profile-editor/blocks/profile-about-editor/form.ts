import { Handle } from "@gororobas/domain/common/primitives"
import type {
  PersonProfileRow as PersonProfileRowSchema,
  ProfileRowUpdate,
} from "@gororobas/domain/profiles/domain"
import { plainTextToTiptapDocument } from "@gororobas/domain/rich-text/plain-text"
import { tiptapToText } from "@gororobas/domain/rich-text/tiptap-to-text"
import { Equal, Option, Result, Schema } from "effect"

import { type Form, HandleCheck, type SaveError } from "./model"

type PersonProfileRow = typeof PersonProfileRowSchema.Type

const bioText = (profile: PersonProfileRow) =>
  profile.bio === null ? "" : tiptapToText(profile.bio)

export const formFromProfile = (profile: PersonProfileRow): Form => ({
  name: profile.name,
  handle: profile.handle,
  bio: bioText(profile),
  maybePhotoId: Option.fromNullishOr(profile.photoId),
})

/** Handles are lowercase and hyphenated: typing spaces or capitals still lands on one. */
export const normalizeHandle = (typed: string) => typed.toLowerCase().replace(/\s+/g, "-")

export const handleCheckFor = (profile: PersonProfileRow, handle: string): HandleCheck => {
  if (handle === profile.handle) {
    return HandleCheck.Unchanged()
  } else if (Schema.is(Handle)(handle)) {
    return HandleCheck.Checking()
  } else {
    return HandleCheck.Invalid()
  }
}

/**
 * What changed since the profile was loaded. A bio whose text is unchanged isn't sent: its
 * formatting from before plain-text editing stays as it was.
 */
export const changesOf = (
  profile: PersonProfileRow,
  form: Form,
): Result.Result<ProfileRowUpdate, SaveError> => {
  const name = form.name.trim()
  if (name === "") return Result.fail("NameMissing")

  const maybeHandle = Schema.decodeOption(Handle)(form.handle)
  if (Option.isNone(maybeHandle)) return Result.fail("HandleInvalid")

  const photoId = Option.getOrNull(form.maybePhotoId)

  return Result.succeed({
    ...(name === profile.name ? {} : { name }),
    ...(maybeHandle.value === profile.handle ? {} : { handle: maybeHandle.value }),
    ...(form.bio === bioText(profile)
      ? {}
      : {
          bio: Option.getOrNull(
            plainTextToTiptapDocument(form.bio, { referenceContent: profile.bio ?? undefined }),
          ),
        }),
    ...(photoId === profile.photoId ? {} : { photoId }),
  })
}

export const isFormChanged = (profile: PersonProfileRow, form: Form) => {
  const saved = formFromProfile(profile)

  return (
    form.name !== saved.name ||
    form.handle !== saved.handle ||
    form.bio !== saved.bio ||
    !Equal.equals(form.maybePhotoId, saved.maybePhotoId)
  )
}
