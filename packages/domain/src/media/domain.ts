/** Media stored on the application VPS; dimensions always describe the original file. */
import { Schema } from "effect"

import { ModerationStatus } from "../common/enums.js"
import { MediaAssetId, PersonId, ProfileId } from "../common/ids.js"
import {
  IntNonNegative,
  NonNegativeNumber,
  PositiveInteger,
  TimestampedStruct,
} from "../common/primitives.js"

const Dimensions = { originalWidth: PositiveInteger, originalHeight: PositiveInteger }

export const ImageMetadata = Schema.Struct({
  format: Schema.Literal("IMAGE"),
  ...Dimensions,
  density: Schema.optional(PositiveInteger),
})

export const VideoMetadata = Schema.Struct({
  format: Schema.Literal("VIDEO"),
  ...Dimensions,
  durationSeconds: NonNegativeNumber,
  rotation: Schema.optional(Schema.Finite),
  codec: Schema.optional(Schema.String),
})

export const AudioMetadata = Schema.Struct({
  format: Schema.Literal("AUDIO"),
  durationSeconds: NonNegativeNumber,
  sampleRate: PositiveInteger,
  numberOfChannels: PositiveInteger,
  codec: Schema.optional(Schema.String),
})

export const MediaAssetMetadata = Schema.Union([ImageMetadata, VideoMetadata, AudioMetadata])
export type MediaAssetMetadata = typeof MediaAssetMetadata.Type

export const MediaAssetFormat = Schema.Literals(["VIDEO", "AUDIO", "IMAGE"])

const MediaAssetFields = {
  ...TimestampedStruct.fields,
  id: MediaAssetId,
  // Null until the original has been copied from the legacy CDN to the VPS.
  storageKey: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/)),
  ),
  contentType: Schema.NullOr(Schema.String),
  byteSize: Schema.NullOr(IntNonNegative),
  label: Schema.NullOr(Schema.String),
  moderationStatus: Schema.NullOr(ModerationStatus),
  ownerProfileId: ProfileId,
}

export const MediaAssetRow = Schema.Union([
  Schema.Struct({
    ...MediaAssetFields,
    format: Schema.Literal("IMAGE"),
    metadata: Schema.fromJsonString(ImageMetadata),
  }),
  Schema.Struct({
    ...MediaAssetFields,
    format: Schema.Literal("VIDEO"),
    metadata: Schema.fromJsonString(VideoMetadata),
  }),
  Schema.Struct({
    ...MediaAssetFields,
    format: Schema.Literal("AUDIO"),
    metadata: Schema.fromJsonString(AudioMetadata),
  }),
]).pipe(Schema.toTaggedUnion("format"))
export type MediaAssetRow = typeof MediaAssetRow.Type

export const MediaAssetCredit = Schema.Struct({
  creditLine: Schema.NullOr(Schema.String),
  creditUrl: Schema.NullOr(Schema.String),
  mediaAssetId: MediaAssetId,
  orderIndex: IntNonNegative,
  personId: Schema.NullOr(PersonId),
})
export type MediaAssetCredit = typeof MediaAssetCredit.Type

export const MediaAssetFileName = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/),
)
