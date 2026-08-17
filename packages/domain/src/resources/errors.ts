/**
 * Resource-related errors.
 */
import { Schema } from "effect"

import { ResourceId, ResourceRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class ResourceNotFoundError extends Schema.TaggedError<ResourceNotFoundError>()(
  "ResourceNotFoundError",
  {
    id: Schema.optional(ResourceId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class ResourceRevisionNotFoundError extends Schema.TaggedError<ResourceRevisionNotFoundError>()(
  "ResourceRevisionNotFoundError",
  {
    id: ResourceRevisionId,
  },
  { httpApiStatus: 404 },
) {}

export class ResourceConcurrentUpdateError extends Schema.TaggedError<ResourceConcurrentUpdateError>()(
  "ResourceConcurrentUpdateError",
  {
    id: ResourceId,
  },
  { httpApiStatus: 409 },
) {}

export class ResourceRevisionEvaluationWindowExpiredError extends Schema.TaggedError<ResourceRevisionEvaluationWindowExpiredError>()(
  "ResourceRevisionEvaluationWindowExpiredError",
  {
    id: ResourceRevisionId,
  },
  { httpApiStatus: 409 },
) {}
