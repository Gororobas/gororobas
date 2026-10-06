import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { Handle } from "../common/primitives.js"
import { ProfilePageData } from "./domain.js"
import { ProfileNotFoundError } from "./errors.js"

export class ProfilesApiGroup extends HttpApiGroup.make("profiles")
  .add(
    HttpApiEndpoint.get("getProfileByHandle", "/profiles/:handle", {
      success: ProfilePageData,
      error: [ProfileNotFoundError, UnauthorizedError],
      params: Schema.Struct({ handle: Handle }),
    }),
  )
  .add(
    HttpApiEndpoint.get("handleAvailability", "/profiles/handle-availability", {
      success: Schema.Boolean,
      query: Schema.Struct({
        handle: Handle,
      }),
    }),
  ) {}
