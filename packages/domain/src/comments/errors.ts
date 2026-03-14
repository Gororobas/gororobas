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


export class CommentConcurrentUpdateError extends Schema.TaggedErrorClass<CommentConcurrentUpdateError>()(
  "CommentConcurrentUpdateError",
  {
    id: CommentId,
  },
  { httpApiStatus: 409 },
) {}
