import { MediaAssetId } from "@gororobas/domain/common/ids"
import { PersonProfileRow } from "@gororobas/domain/profiles/domain"
import { Schema } from "effect"
import { AsyncData } from "foldkit"
import { defineTaggedUnion } from "foldkit/schema"

import { ClientFailure } from "../../../../lib/client-failure"

export const Profile = AsyncData.Schema(PersonProfileRow, ClientFailure)

/** Whether the handle being typed could be theirs. */
export const HandleCheck = defineTaggedUnion({
  /** It's their current handle. */
  Unchanged: {},
  /** It doesn't fit what handles accept. */
  Invalid: {},
  Checking: {},
  Available: {},
  Taken: {},
  /** The check failed; saving tells for sure. */
  Unknown: {},
})

export type HandleCheck = typeof HandleCheck.Type

export const PhotoUpload = Schema.Literals(["Idle", "Uploading", "Failed"])
export type PhotoUpload = typeof PhotoUpload.Type

/** Why saving didn't go through, which the view says in the reader's language. */
export const SaveError = Schema.Literals([
  "NameMissing",
  "HandleInvalid",
  "HandleTaken",
  "PhotoInvalid",
  "SaveFailed",
])

export type SaveError = typeof SaveError.Type

export const SaveStatus = defineTaggedUnion({
  Idle: {},
  Saving: {},
  /** Until the next edit. */
  Saved: {},
  Failed: { error: SaveError },
})

export type SaveStatus = typeof SaveStatus.Type

/** What's typed, before saving. The bio is plain text: paragraphs separated by blank lines. */
export const Form = Schema.Struct({
  name: Schema.String,
  handle: Schema.String,
  bio: Schema.String,
  maybePhotoId: Schema.Option(MediaAssetId),
})

export type Form = typeof Form.Type

export const Model = Schema.Struct({
  profile: Profile.schema,
  /** Bumped after saving, so the profile reloads as stored. */
  reloadCount: Schema.Int,
  form: Form,
  handleCheck: HandleCheck,
  photoUpload: PhotoUpload,
  save: SaveStatus,
})

export type Model = typeof Model.Type
