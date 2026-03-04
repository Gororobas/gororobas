import { Schema } from "effect"
/**
 * Profiles HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"

import { Handle } from "../common/primitives.js"
import { ProfilePageData } from "./domain.js"
import { ProfileNotFoundError } from "./errors.js"

export class ProfilesApiGroup extends HttpApiGroup.make("profiles")
  .add(
    HttpApiEndpoint.get("getProfileByHandle", "/profiles/:handle")
      .addSuccess(ProfilePageData)
      .addError(ProfileNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ handle: Handle })),
  )
  .add(
    HttpApiEndpoint.get("handleAvailability", "/profiles/handle-availability")
      .addSuccess(Schema.Boolean)
      .setUrlParams(
        Schema.Struct({
          handle: Handle,
        }),
      ),
  )
  .addError(HttpApiError.InternalServerError) {}
