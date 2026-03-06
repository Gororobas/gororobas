import { Schema } from "effect"
/**
 * Profiles HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"

import { Handle } from "../common/primitives.js"
import { ProfilePageData } from "./domain.js"
import { ProfileNotFoundError } from "./errors.js"

export class ProfilesApiGroup extends HttpApiGroup.make("profiles")
  .add(
    HttpApiEndpoint.get("getProfileByHandle", "/profiles/:handle", {
      success: ProfilePageData,
      error: ProfileNotFoundError.pipe(HttpApiSchema.status(404)),
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
