/**
 * Comment-related errors.
 */
import { Schema } from "effect"

import { CommentId } from "../common/ids.js"

export class CommentNotFoundError extends Schema.TaggedErrorClass<CommentNotFoundError>()(
  "CommentNotFoundError",
  {
    id: CommentId,
  },
  { httpApiStatus: 404 },
) {}
