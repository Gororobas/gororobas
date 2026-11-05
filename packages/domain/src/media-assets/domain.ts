/** Media stored on the application VPS; dimensions always describe the original file. */
import { Duration, Schema } from "effect"

import { ModerationStatus } from "../common/enums.js"
import { MediaAssetId, PersonId, ProfileId } from "../common/ids.js"
import { Handle, IntNonNegative, PositiveInteger, TimestampedStruct } from "../common/primitives.js"
import { MediaAssetDescriptions } from "./attachments.js"

// JSON stores milliseconds; reject durations that cannot round-trip through that representation.
const MediaDuration = Schema.DurationFromMillis.check(
  Schema.makeFilter(
    (duration) => {
      const milliseconds = Duration.toMillis(duration)

      return (
        Number.isFinite(milliseconds * 1_000_000) &&
        milliseconds >= 0 &&
        Duration.equals(duration, Duration.millis(milliseconds))
      )
    },
    {
      identifier: "MediaDuration",
      title: "Media duration",
      description: "A non-negative duration that round-trips through finite milliseconds.",
    },
  ),
)

const Dimensions = { originalWidth: PositiveInteger, originalHeight: PositiveInteger }

export const ImageMetadata = Schema.Struct({
  format: Schema.Literal("IMAGE"),
  ...Dimensions,
  density: Schema.optional(PositiveInteger),
})

export const VideoMetadata = Schema.Struct({
  format: Schema.Literal("VIDEO"),
  ...Dimensions,
  duration: MediaDuration,
  rotation: Schema.optional(Schema.Finite),
  codec: Schema.optional(Schema.String),
})

export const AudioMetadata = Schema.Struct({
  format: Schema.Literal("AUDIO"),
  duration: MediaDuration,
  sampleRate: PositiveInteger,
  numberOfChannels: PositiveInteger,
  codec: Schema.optional(Schema.String),
})

export const MediaAssetMetadata = Schema.Union([ImageMetadata, VideoMetadata, AudioMetadata])
export type MediaAssetMetadata = typeof MediaAssetMetadata.Type

const coreMediaAssetRowFields = {
  ...TimestampedStruct.fields,
  id: MediaAssetId,
  contentType: Schema.NullOr(Schema.String),
  byteSize: Schema.NullOr(IntNonNegative),
  category: Schema.NullOr(Schema.String),
  descriptions: Schema.fromJsonString(MediaAssetDescriptions),
  moderationStatus: ModerationStatus,
  ownerProfileId: ProfileId,
}

export const MediaAssetRow = Schema.Union([
  Schema.Struct({
    ...coreMediaAssetRowFields,
    format: Schema.Literal("IMAGE"),
    metadata: Schema.fromJsonString(ImageMetadata),
  }),
  Schema.Struct({
    ...coreMediaAssetRowFields,
    format: Schema.Literal("VIDEO"),
    metadata: Schema.fromJsonString(VideoMetadata),
  }),
  Schema.Struct({
    ...coreMediaAssetRowFields,
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

/** A profile credited for media, with what an avatar needs. */
export const CreditedProfile = Schema.Struct({
  id: ProfileId,
  handle: Handle,
  name: Schema.String,
  photoId: Schema.NullOr(MediaAssetId),
})

export type CreditedProfile = typeof CreditedProfile.Type

/**
 * Who to credit for media, as readers see it: a profile in the app, or free text with an optional
 * link. Media without credits of its own credits whoever uploaded it.
 */
export const DisplayedMediaCredit = Schema.Struct({
  profile: Schema.NullOr(CreditedProfile),
  creditLine: Schema.NullOr(Schema.String),
  creditUrl: Schema.NullOr(Schema.String),
})

export type DisplayedMediaCredit = typeof DisplayedMediaCredit.Type

/** Media as an article's page shows it: with the people to credit for it. */
export const CreditedMediaAssetRow = MediaAssetRow.mapMembers((members) =>
  members.map((member) =>
    Schema.Struct({ ...member.fields, credits: Schema.Array(DisplayedMediaCredit) }),
  ),
).pipe(Schema.toTaggedUnion("format"))

export type CreditedMediaAssetRow = typeof CreditedMediaAssetRow.Type

export const TransformedImageWidthBreakpoints = Schema.Literals([50, 300, 1280, 2400])

export const TransformedVideoHeightBreakpoints = Schema.Literals([360, 720, 1080])

export const MediaAssetRequest = Schema.Union([
  Schema.Struct({
    id: MediaAssetId,
    format: Schema.Literal("images"),
    variant: Schema.TemplateLiteral([TransformedImageWidthBreakpoints]),
  }),
  Schema.Struct({
    id: MediaAssetId,
    format: Schema.Literal("audio"),
    variant: Schema.Literals(["audio.webm", "audio.m4a"]),
  }),
  Schema.Struct({
    id: MediaAssetId,
    format: Schema.Literal("video"),
    variant: Schema.String.check(Schema.isPattern(/^(video\.mp4|[a-zA-Z0-9_-]+\.(m3u8|ts))$/)),
  }),
  Schema.Struct({
    id: MediaAssetId,
    format: Schema.Literal("original"),
    variant: Schema.Literal("original"),
  }),
])

export type MediaAssetRequest = typeof MediaAssetRequest.Type
