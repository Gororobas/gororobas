/**
 * Media-related errors.
 */
import { Schema } from "effect"

import { ImageId } from "../common/ids.js"

export class MediaNotFoundError extends Schema.TaggedErrorClass<MediaNotFoundError>()(
  "MediaNotFoundError",
  {
    id: ImageId,
  },
  { httpApiStatus: 404 },
) {}
