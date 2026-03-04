/**
 * Comment-related errors.
 */
import { Schema } from "effect"

import { CommentId } from "../common/ids.js"

export class CommentNotFoundError extends Schema.TaggedError<CommentNotFoundError>()(
  "CommentNotFoundError",
  {
    id: CommentId,
  },
) {}
