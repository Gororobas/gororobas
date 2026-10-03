import { Schema } from "effect"
/**
 * Media HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

import { ModerationStatus } from "../common/enums.js"
import { MediaAssetId } from "../common/ids.js"
import { MediaAssetFileName } from "./domain.js"
import { MediaAssetStorageError, InvalidMediaAssetError, MediaNotFoundError } from "./errors.js"

export const MediaUploadData = Schema.Struct({
  contentType: Schema.Trimmed.check(Schema.isNonEmpty()),
  fileName: Schema.Trimmed.check(Schema.isNonEmpty()),
  id: MediaAssetId,
  moderationStatus: Schema.NullOr(ModerationStatus),
  byteSize: Schema.Int,
  url: Schema.String,
})
export type MediaUploadData = typeof MediaUploadData.Type

export const AttachMediaToPublicationData = Schema.Struct({
  media_ids: Schema.NonEmptyArray(MediaAssetId),
})
export type AttachMediaToPublicationData = typeof AttachMediaToPublicationData.Type

export const AttachMediaToWikiArticleData = Schema.Struct({
  media_ids: Schema.NonEmptyArray(MediaAssetId),
  wiki_article_handles: Schema.NonEmptyArray(Schema.Trimmed.check(Schema.isNonEmpty())),
})
export type AttachMediaToWikiArticleData = typeof AttachMediaToWikiArticleData.Type

export class MediaApiGroup extends HttpApiGroup.make("media")
  .add(
    HttpApiEndpoint.post("uploadMedia", "/media/upload", {
      success: MediaUploadData,
      error: [InvalidMediaAssetError, MediaAssetStorageError],
      payload: Schema.Struct({
        contentType: Schema.Trimmed.check(Schema.isNonEmpty()),
        file: Schema.Uint8ArrayFromBase64,
        fileName: Schema.Trimmed.check(Schema.isNonEmpty()),
      }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getMedia", "/media/:id", {
      success: MediaUploadData,
      error: MediaNotFoundError.pipe(HttpApiSchema.status(404)),
      params: Schema.Struct({ id: MediaAssetId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getMediaFile", "/media/:id/files/:name", {
      success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
      error: MediaNotFoundError,
      params: Schema.Struct({ id: MediaAssetId, name: MediaAssetFileName }),
    }),
  )
  .add(
    HttpApiEndpoint.post("censorMedia", "/media/:id/censor", {
      success: Schema.Struct({ moderationStatus: ModerationStatus }),
      error: MediaNotFoundError.pipe(HttpApiSchema.status(404)),
      params: Schema.Struct({ id: MediaAssetId }),
      payload: Schema.Struct({
        reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
      }),
    }),
  ) {}
