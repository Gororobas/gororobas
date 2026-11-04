import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { ProfileLocationId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { GazetteerPlaceNotFoundError } from "../places/errors.js"
import { ProfilePageData, ProfileSearchParams, ProfileCardData } from "./domain.js"
import {
  InvalidProfileLocationDatesError,
  ProfileLocationNotFoundError,
  ProfileNotFoundError,
} from "./errors.js"
import { ProfileLocationData, ProfileLocationPayload } from "./locations.js"

export class ProfilesApiGroup extends HttpApiGroup.make("profiles")
  .add(
    HttpApiEndpoint.get("searchProfiles", "/profiles/search", {
      success: Schema.Array(ProfileCardData),
      query: ProfileSearchParams,
    }),
  )
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
  )
  // The signed-in person's location timeline.
  .add(
    HttpApiEndpoint.get("listMyLocations", "/people/me/locations", {
      success: Schema.Array(ProfileLocationData),
      error: UnauthorizedError,
    }),
  )
  .add(
    HttpApiEndpoint.post("addMyLocation", "/people/me/locations", {
      success: ProfileLocationData,
      error: [GazetteerPlaceNotFoundError, InvalidProfileLocationDatesError, UnauthorizedError],
      payload: ProfileLocationPayload,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateMyLocation", "/people/me/locations/:id", {
      success: ProfileLocationData,
      error: [
        GazetteerPlaceNotFoundError,
        InvalidProfileLocationDatesError,
        ProfileLocationNotFoundError,
        UnauthorizedError,
      ],
      params: Schema.Struct({ id: ProfileLocationId }),
      payload: ProfileLocationPayload,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteMyLocation", "/people/me/locations/:id", {
      success: Schema.Void,
      error: [ProfileLocationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: ProfileLocationId }),
    }),
  ) {}
