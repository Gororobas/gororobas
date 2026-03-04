import { Schema } from "effect"
/**
 * Media HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { ModerationStatus } from "../common/enums.js"
import { ImageId } from "../common/ids.js"
import { MediaNotFoundError } from "./errors.js"

export const MediaUploadData = Schema.Struct({
  content_type: Schema.NonEmptyTrimmedString,
  file_name: Schema.NonEmptyTrimmedString,
  id: ImageId,
  moderation_status: Schema.NullishOr(ModerationStatus),
  size_bytes: Schema.Int,
  url: Schema.NonEmptyTrimmedString,
})
export type MediaUploadData = typeof MediaUploadData.Type

export const AttachMediaToPostData = Schema.Struct({
  media_ids: Schema.NonEmptyArray(ImageId),
})
export type AttachMediaToPostData = typeof AttachMediaToPostData.Type

export const AttachMediaToVegetableData = Schema.Struct({
  media_ids: Schema.NonEmptyArray(ImageId),
  vegetable_handles: Schema.NonEmptyArray(Schema.NonEmptyTrimmedString),
})
export type AttachMediaToVegetableData = typeof AttachMediaToVegetableData.Type

export class MediaApiGroup extends HttpApiGroup.make("media")
  .add(
    HttpApiEndpoint.post("uploadMedia", "/media/upload")
      .addSuccess(MediaUploadData)
      .setPayload(
        Schema.Struct({
          content_type: Schema.NonEmptyTrimmedString,
          file: Schema.Uint8Array,
          file_name: Schema.NonEmptyTrimmedString,
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("getMedia", "/media/:id")
      .addSuccess(MediaUploadData)
      .addError(MediaNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: ImageId })),
  )
  .add(
    HttpApiEndpoint.post("censorMedia", "/media/:id/censor")
      .addSuccess(Schema.Struct({ moderation_status: ModerationStatus }))
      .addError(MediaNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: ImageId }))
      .setPayload(Schema.Struct({ reason: Schema.optional(Schema.NonEmptyTrimmedString) })),
  ) {}
