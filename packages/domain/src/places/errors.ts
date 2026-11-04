import { Schema } from "effect"

import { WhosOnFirstId } from "../common/external-identifiers.js"

/** No gazetteer place has this ID, or no municipality contains the given coordinates. */
export class GazetteerPlaceNotFoundError extends Schema.TaggedError<GazetteerPlaceNotFoundError>()(
  "GazetteerPlaceNotFoundError",
  { id: Schema.optional(WhosOnFirstId) },
  { httpApiStatus: 404 },
) {}
