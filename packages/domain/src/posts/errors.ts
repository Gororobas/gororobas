/**
 * Post-related errors.
 */
import { Schema } from "effect"

import { PostId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class PostNotFoundError extends Schema.TaggedError<PostNotFoundError>()(
  "PostNotFoundError",
  {
    id: Schema.optional(PostId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class PostConcurrentUpdateError extends Schema.TaggedError<PostConcurrentUpdateError>()(
  "PostConcurrentUpdateError",
  {
    id: PostId,
  },
  { httpApiStatus: 409 },
) {}
