import { Coordinates, areaContains, type AreaGeometry } from "@gororobas/domain/places/geometry"
import { ElevationInMeters } from "@gororobas/domain/profiles/locations"
import { Effect, Option, Schema } from "effect"
import { defineTaggedUnion } from "foldkit/schema"

/**
 * Where the device is. Only read when someone asks, and kept in memory: coordinates only travel to
 * lookups that turn them into places, which don't keep them.
 */
export const DeviceLocation = defineTaggedUnion({
  Unrequested: {},
  Locating: {},
  Located: { coordinates: Coordinates, maybeElevation: Schema.Option(ElevationInMeters) },
  Unavailable: {},
})

export type DeviceLocation = typeof DeviceLocation.Type

/** The device's elevation, when it reported one from inside `area`. */
export const elevationWithin = (
  deviceLocation: DeviceLocation,
  area: AreaGeometry,
): Option.Option<ElevationInMeters> =>
  DeviceLocation.guards.Located(deviceLocation) && areaContains(area, deviceLocation.coordinates)
    ? deviceLocation.maybeElevation
    : Option.none()

class PositionUnavailableError extends Schema.TaggedError<PositionUnavailableError>()(
  "PositionUnavailableError",
  {},
) {}

const currentPosition = Effect.callback<GeolocationPosition, PositionUnavailableError>((resume) => {
  if (!("geolocation" in navigator)) {
    resume(Effect.fail(new PositionUnavailableError()))
    return
  }

  navigator.geolocation.getCurrentPosition(
    (position) => resume(Effect.succeed(position)),
    () => resume(Effect.fail(new PositionUnavailableError())),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
  )
})

/** Asks the browser where the device is, which may prompt the person for permission. */
export const readDeviceLocation: Effect.Effect<DeviceLocation> = currentPosition.pipe(
  Effect.map(({ coords }) =>
    DeviceLocation.Located({
      coordinates: { latitude: coords.latitude, longitude: coords.longitude },
      maybeElevation: Option.flatMap(Option.fromNullishOr(coords.altitude), (altitude) =>
        Schema.decodeOption(ElevationInMeters)(altitude),
      ),
    }),
  ),
  Effect.orElseSucceed(() => DeviceLocation.Unavailable()),
)
