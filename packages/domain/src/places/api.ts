import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { WhosOnFirstId } from "../common/external-identifiers.js"
import { GazetteerPlace, GazetteerPlaceSummary, GazetteerSearchParams } from "./domain.js"
import { GazetteerPlaceNotFoundError } from "./errors.js"
import { Coordinates } from "./geometry.js"

export class PlacesApiGroup extends HttpApiGroup.make("places")
  .add(
    /** Ranks places in the person's country first, from their latest location or their request. */
    HttpApiEndpoint.get("searchGazetteerPlaces", "/places/gazetteer", {
      success: Schema.Array(GazetteerPlaceSummary),
      error: UnauthorizedError,
      query: GazetteerSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getGazetteerPlace", "/places/gazetteer/:id", {
      success: GazetteerPlace,
      error: [GazetteerPlaceNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: WhosOnFirstId }),
    }),
  )
  .add(
    /** The municipality containing a device's coordinates. The coordinates are neither stored nor logged. */
    HttpApiEndpoint.post("findMunicipalityContaining", "/places/gazetteer/containing", {
      success: GazetteerPlace,
      error: [GazetteerPlaceNotFoundError, UnauthorizedError],
      payload: Coordinates,
    }),
  ) {}
