/**
 * Tag-related errors.
 */
import { Schema } from "effect"

import { TagId } from "../common/ids.js"

export class TagNotFoundError extends Schema.TaggedError<TagNotFoundError>()("TagNotFoundError", {
  id: TagId,
}) { }
