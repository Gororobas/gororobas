/**
 * Publication comment errors.
 */
import { Schema } from "effect"

import { PublicationCommentId } from "../common/ids.js"

export class PublicationCommentNotFoundError extends Schema.TaggedError<PublicationCommentNotFoundError>()(
  "PublicationCommentNotFoundError",
  {
    id: PublicationCommentId,
  },
  { httpApiStatus: 404 },
) {}

export class PublicationCommentConcurrentUpdateError extends Schema.TaggedError<PublicationCommentConcurrentUpdateError>()(
  "PublicationCommentConcurrentUpdateError",
  {
    id: PublicationCommentId,
  },
  { httpApiStatus: 409 },
) {}
