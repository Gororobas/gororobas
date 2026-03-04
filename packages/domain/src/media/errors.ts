/**
 * Media-related errors.
 */
import { Schema } from "effect"

import { ImageId } from "../common/ids.js"

export class MediaNotFoundError extends Schema.TaggedError<MediaNotFoundError>()(
  "MediaNotFoundError",
  {
    id: ImageId,
  },
) { }
