/**
 * Vegetable-related errors.
 */
import { Schema } from "effect"

import { VegetableId, VegetableRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class VegetableNotFoundError extends Schema.TaggedError<VegetableNotFoundError>()(
  "VegetableNotFoundError",
  {
    id: Schema.optional(VegetableId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class VegetableRevisionNotFoundError extends Schema.TaggedError<VegetableRevisionNotFoundError>()(
  "VegetableRevisionNotFoundError",
  {
    id: Schema.optional(VegetableRevisionId),
  },
  { httpApiStatus: 404 },
) {}
