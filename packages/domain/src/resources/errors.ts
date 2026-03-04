/**
 * Resource-related errors.
 */
import { Schema } from "effect"

import { ResourceId, ResourceRevisionId } from "../common/ids.js"

export class ResourceNotFoundError extends Schema.TaggedError<ResourceNotFoundError>()(
  "ResourceNotFoundError",
  {
    id: ResourceId,
  },
) {}

export class ResourceRevisionNotFoundError extends Schema.TaggedError<ResourceRevisionNotFoundError>()(
  "ResourceRevisionNotFoundError",
  {
    id: ResourceRevisionId,
  },
) {}
