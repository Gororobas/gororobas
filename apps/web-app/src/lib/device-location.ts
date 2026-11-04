import { Coordinates, areaContains, type AreaGeometry } from "@gororobas/domain/places/geometry"
import { ElevationInMeters } from "@gororobas/domain/profiles/locations"
import { Option, Schema } from "effect"
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
