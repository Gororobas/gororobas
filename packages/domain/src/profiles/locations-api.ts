import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { ProfileLocationId } from "../common/ids.js"
import { GazetteerPlaceNotFoundError } from "../places/errors.js"
import { InvalidProfileLocationDatesError, ProfileLocationNotFoundError } from "./errors.js"
import { ProfileLocationData, ProfileLocationPayload } from "./locations.js"

/** The signed-in person's location timeline. */
export class ProfileLocationsApiGroup extends HttpApiGroup.make("profileLocations")
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
