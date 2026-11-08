import { MediaAssetId } from "@gororobas/domain/common/ids"
import { PersonProfileRow } from "@gororobas/domain/profiles/domain"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

import { ClientFailure } from "../../../../lib/client-failure"
import { SaveError } from "./model"

export const Message = defineMessageUnion({
  SucceededLoadProfile: { profile: PersonProfileRow },
  FailedLoadProfile: { error: ClientFailure },

  UpdatedName: { value: Schema.String },
  UpdatedHandle: { value: Schema.String },
  UpdatedBio: { value: Schema.String },
  SucceededCheckHandle: { handle: Schema.String, isAvailable: Schema.Boolean },
  FailedCheckHandle: { handle: Schema.String },

  ClickedChoosePhoto: {},
  ClickedRemovePhoto: {},
  CancelledChoosePhoto: {},
  SucceededUploadPhoto: { id: MediaAssetId },
  FailedUploadPhoto: {},

  SubmittedForm: {},
  ClickedDiscardChanges: {},
  SucceededSaveProfile: {},
  FailedSaveProfile: { error: SaveError },
})
