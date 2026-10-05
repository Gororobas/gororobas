/**
 * Media-related errors.
 */
import { Schema } from "effect"

import { MediaAssetId } from "../common/ids.js"

export class MediaNotFoundError extends Schema.TaggedError<MediaNotFoundError>()(
  "MediaNotFoundError",
  {
    id: MediaAssetId,
  },
  { httpApiStatus: 404 },
) {}

export class InvalidMediaAssetError extends Schema.TaggedError<InvalidMediaAssetError>()(
  "InvalidMediaAssetError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class MediaAssetStorageError extends Schema.TaggedError<MediaAssetStorageError>()(
  "MediaAssetStorageError",
  { cause: Schema.Unknown },
  { httpApiStatus: 500 },
) {}
