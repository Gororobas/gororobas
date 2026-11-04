/**
 * Profile-related errors.
 */
import { Schema } from "effect"

import { ProfileId, ProfileLocationId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class ProfileNotFoundError extends Schema.TaggedError<ProfileNotFoundError>()(
  "ProfileNotFoundError",
  {
    id: Schema.optional(ProfileId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class ProfileLocationNotFoundError extends Schema.TaggedError<ProfileLocationNotFoundError>()(
  "ProfileLocationNotFoundError",
  { id: ProfileLocationId },
  { httpApiStatus: 404 },
) {}

/** A location can't end before it starts. */
export class InvalidProfileLocationDatesError extends Schema.TaggedError<InvalidProfileLocationDatesError>()(
  "InvalidProfileLocationDatesError",
  {},
  { httpApiStatus: 400 },
) {}
