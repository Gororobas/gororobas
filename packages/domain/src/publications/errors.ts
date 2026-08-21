/**
 * Publication-related errors.
 */
import { Schema } from "effect"

import { PublicationId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class PublicationNotFoundError extends Schema.TaggedError<PublicationNotFoundError>()(
  "PublicationNotFoundError",
  {
    id: Schema.optional(PublicationId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class PublicationConcurrentUpdateError extends Schema.TaggedError<PublicationConcurrentUpdateError>()(
  "PublicationConcurrentUpdateError",
  {
    id: PublicationId,
  },
  { httpApiStatus: 409 },
) {}
