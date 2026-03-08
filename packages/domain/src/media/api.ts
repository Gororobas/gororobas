import { Schema } from "effect"
/**
 * Media HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"

import { ModerationStatus } from "../common/enums.js"
import { ImageId } from "../common/ids.js"
import { MediaNotFoundError } from "./errors.js"

export const MediaUploadData = Schema.Struct({
  content_type: Schema.Trimmed.check(Schema.isNonEmpty()),
  file_name: Schema.Trimmed.check(Schema.isNonEmpty()),
  id: ImageId,
  moderation_status: Schema.NullOr(ModerationStatus),
  size_bytes: Schema.Int,
  url: Schema.URLFromString,
})
export type MediaUploadData = typeof MediaUploadData.Type

export const AttachMediaToPostData = Schema.Struct({
  media_ids: Schema.NonEmptyArray(ImageId),
})
export type AttachMediaToPostData = typeof AttachMediaToPostData.Type

export const AttachMediaToVegetableData = Schema.Struct({
  media_ids: Schema.NonEmptyArray(ImageId),
  vegetable_handles: Schema.NonEmptyArray(Schema.Trimmed.check(Schema.isNonEmpty())),
})
export type AttachMediaToVegetableData = typeof AttachMediaToVegetableData.Type

export class MediaApiGroup extends HttpApiGroup.make("media")
  .add(
    HttpApiEndpoint.post("uploadMedia", "/media/upload", {
      success: MediaUploadData,
      payload: Schema.Struct({
        content_type: Schema.Trimmed.check(Schema.isNonEmpty()),
        file: Schema.Uint8Array,
        file_name: Schema.Trimmed.check(Schema.isNonEmpty()),
      }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getMedia", "/media/:id", {
      success: MediaUploadData,
      error: MediaNotFoundError.pipe(HttpApiSchema.status(404)),
      params: Schema.Struct({ id: ImageId }),
    }),
  )
  .add(
    HttpApiEndpoint.post("censorMedia", "/media/:id/censor", {
      success: Schema.Struct({ moderation_status: ModerationStatus }),
      error: MediaNotFoundError.pipe(HttpApiSchema.status(404)),
      params: Schema.Struct({ id: ImageId }),
      payload: Schema.Struct({
        reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
      }),
    }),
  ) {}
