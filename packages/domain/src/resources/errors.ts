/**
 * Resource-related errors.
 */
import { Schema } from "effect"

import { ResourceId, ResourceRevisionId } from "../common/ids.js"

export class ResourceNotFoundError extends Schema.TaggedErrorClass<ResourceNotFoundError>()(
  "ResourceNotFoundError",
  {
    id: ResourceId,
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
