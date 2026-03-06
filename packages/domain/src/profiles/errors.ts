/**
 * Profile-related errors.
 */
import { Schema } from "effect"

import { ProfileId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class ProfileNotFoundError extends Schema.TaggedErrorClass<ProfileNotFoundError>()(
  "ProfileNotFoundError",
  {
    id: Schema.optional(ProfileId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}
