/**
 * Resource-related errors.
 */
import { Schema } from "effect"

import { ResourceId, ResourceRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class ResourceNotFoundError extends Schema.TaggedErrorClass<ResourceNotFoundError>()(
  "ResourceNotFoundError",
  {
    id: Schema.optional(ResourceId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class ResourceRevisionNotFoundError extends Schema.TaggedErrorClass<ResourceRevisionNotFoundError>()(
  "ResourceRevisionNotFoundError",
  {
    id: ResourceRevisionId,
  },
  { httpApiStatus: 404 },
) {}

export class ResourceConcurrentUpdateError extends Schema.TaggedErrorClass<ResourceConcurrentUpdateError>()(
  "ResourceConcurrentUpdateError",
  {
    id: ResourceId,
  },
  { httpApiStatus: 409 },
) {}

export class ResourceRevisionEvaluationWindowExpiredError extends Schema.TaggedErrorClass<ResourceRevisionEvaluationWindowExpiredError>()(
  "ResourceRevisionEvaluationWindowExpiredError",
  {
    id: ResourceRevisionId,
  },
  { httpApiStatus: 409 },
) {}
