/**
 * Tag-related errors.
 */
import { Schema } from "effect"

import { TagId } from "../common/ids.js"

export class TagNotFoundError extends Schema.TaggedErrorClass<TagNotFoundError>()(
  "TagNotFoundError",
  {
    id: TagId,
  },
  { httpApiStatus: 404 },
) {}
