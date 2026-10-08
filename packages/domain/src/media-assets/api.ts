import { Schema } from "effect"
import { Multipart } from "effect/http"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { ModerationStatus } from "../common/enums.js"
import { MediaAssetId } from "../common/ids.js"
import { MediaAssetRequest } from "./domain.js"
import { MediaAssetStorageError, InvalidMediaAssetError, MediaNotFoundError } from "./errors.js"

export const MediaUploadData = Schema.Struct({
  contentType: Schema.Trimmed.check(Schema.isNonEmpty()),
  fileName: Schema.Trimmed.check(Schema.isNonEmpty()),
  id: MediaAssetId,
  moderationStatus: ModerationStatus,
  byteSize: Schema.Int,
  url: Schema.String,
})

export type MediaUploadData = typeof MediaUploadData.Type

export class MediaAssetsApi extends HttpApiGroup.make("mediaAssets")
  .add(
    HttpApiEndpoint.post("uploadMedia", "/media/upload", {
      success: MediaUploadData,
      error: [InvalidMediaAssetError, MediaAssetStorageError, UnauthorizedError],
      payload: Schema.Struct({ file: Multipart.SingleFileSchema }).pipe(
        HttpApiSchema.asMultipartStream({
          // One form field; the file body is still consumed as a stream of chunks.
          maxParts: 1,
          maxFileSize: "5 GiB",
          maxTotalSize: "5 GiB",
        }),
      ),
    }),
  )
  .add(
    HttpApiEndpoint.get("getMedia", "/media/:id/:format/:variant", {
      success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
      error: [MediaNotFoundError, MediaAssetStorageError],
      params: MediaAssetRequest,
    }),
  )
  .add(
    HttpApiEndpoint.post("moderateMedia", "/media/:id/moderate", {
      success: Schema.Struct({ moderationStatus: ModerationStatus }),
      error: [MediaNotFoundError.pipe(HttpApiSchema.status(404)), UnauthorizedError],
      params: Schema.Struct({ id: MediaAssetId }),
      payload: Schema.Struct({
        moderationStatus: Schema.Literals(["CENSORED", "REAPPROVED_AFTER_CENSORING"]),
      }),
    }),
  ) {}
