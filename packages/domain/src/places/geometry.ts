/**
 * GeoJSON areas (RFC 7946) and the few planar operations places need: bounding boxes,
 * point-in-area tests and simplification for display.
 *
 * Coordinates are `[longitude, latitude]`, as in GeoJSON. Operations treat them as planar,
 * which is accurate enough at the scale of municipalities and states.
 */
import { Array as EffectArray, Option, Schema } from "effect"

export const Longitude = Schema.Finite.check(Schema.isBetween({ minimum: -180, maximum: 180 }))
export type Longitude = typeof Longitude.Type

export const Latitude = Schema.Finite.check(Schema.isBetween({ minimum: -90, maximum: 90 }))
export type Latitude = typeof Latitude.Type

export const Coordinates = Schema.Struct({ latitude: Latitude, longitude: Longitude })
export type Coordinates = typeof Coordinates.Type

export const Position = Schema.Tuple([Longitude, Latitude])
export type Position = typeof Position.Type

/** A closed ring: its first and last positions are equal, so it needs at least four. */
export const LinearRing = Schema.NonEmptyArray(Position).check(
  Schema.isMinLength(4),
  Schema.makeFilter(
    (ring) => {
      const first = EffectArray.headNonEmpty(ring)
      const last = EffectArray.lastNonEmpty(ring)
      return (first[0] === last[0] && first[1] === last[1]) || "must end where it starts"
    },
    {
      identifier: "ClosedLinearRing",
      title: "Closed ring",
      description: "Requires the ring's last position to repeat its first, as GeoJSON does",
    },
  ),
)

export type LinearRing = typeof LinearRing.Type

/** The outer ring first, then any holes. */
export const PolygonRings = Schema.NonEmptyArray(LinearRing)
export type PolygonRings = typeof PolygonRings.Type

export const AreaGeometry = Schema.Union([
  Schema.Struct({ type: Schema.Literal("Polygon"), coordinates: PolygonRings }),
  Schema.Struct({
    type: Schema.Literal("MultiPolygon"),
    coordinates: Schema.NonEmptyArray(PolygonRings),
  }),
])

export type AreaGeometry = typeof AreaGeometry.Type

export const BoundingBox = Schema.Struct({
  minLongitude: Longitude,
  minLatitude: Latitude,
  maxLongitude: Longitude,
  maxLatitude: Latitude,
})

export type BoundingBox = typeof BoundingBox.Type

const polygonsOf = (geometry: AreaGeometry): ReadonlyArray<PolygonRings> =>
  geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates

export const geometryToBoundingBox = (geometry: AreaGeometry): BoundingBox => {
  // Holes lie inside their outer ring, so outer rings bound the area.
  const positions = polygonsOf(geometry).flatMap((polygon) => polygon[0])
  const longitudes = positions.map(([longitude]) => longitude)
  const latitudes = positions.map(([, latitude]) => latitude)

  return {
    minLongitude: Math.min(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLongitude: Math.max(...longitudes),
    maxLatitude: Math.max(...latitudes),
  }
}

export const boundingBoxContains = (box: BoundingBox, point: Coordinates): boolean =>
  point.longitude >= box.minLongitude &&
  point.longitude <= box.maxLongitude &&
  point.latitude >= box.minLatitude &&
  point.latitude <= box.maxLatitude

/** A closed ring's edges: each position with the next one. */
const edges = (ring: LinearRing) => EffectArray.zip(ring.slice(0, -1), ring.slice(1))

/** Even-odd ray casting: a point inside a hole crosses one ring more and ends up outside. */
const ringCrossings = (ring: LinearRing, { longitude, latitude }: Coordinates): number =>
  edges(ring).filter(
    ([[longitudeA, latitudeA], [longitudeB, latitudeB]]) =>
      latitudeA > latitude !== latitudeB > latitude &&
      longitude <
        ((longitudeB - longitudeA) * (latitude - latitudeA)) / (latitudeB - latitudeA) + longitudeA,
  ).length

export const areaContains = (geometry: AreaGeometry, point: Coordinates): boolean =>
  polygonsOf(geometry).some(
    (polygon) => polygon.reduce((sum, ring) => sum + ringCrossings(ring, point), 0) % 2 === 1,
  )

const distanceToSegment = ({
  point,
  start,
  end,
}: Readonly<{ point: Position; start: Position; end: Position }>): number => {
  const deltaLongitude = end[0] - start[0]
  const deltaLatitude = end[1] - start[1]
  const lengthSquared = deltaLongitude ** 2 + deltaLatitude ** 2

  const along =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * deltaLongitude + (point[1] - start[1]) * deltaLatitude) /
              lengthSquared,
          ),
        )

  return Math.hypot(
    point[0] - (start[0] + along * deltaLongitude),
    point[1] - (start[1] + along * deltaLatitude),
  )
}

/** Douglas–Peucker over an open path, keeping both ends. */
const simplifyPath = (
  path: EffectArray.NonEmptyReadonlyArray<Position>,
  tolerance: number,
): EffectArray.NonEmptyArray<Position> => {
  const kept = path.map((_, index) => index === 0 || index === path.length - 1)
  const pending: Array<readonly [number, number]> = [[0, path.length - 1]]

  // oxlint-disable-next-line effect/imperative-loops -- Iterative, so outlines with tens of thousands of positions can't overflow the call stack.
  while (EffectArray.isArrayNonEmpty(pending)) {
    const [first, last] = EffectArray.lastNonEmpty(pending)
    pending.pop()
    const start = EffectArray.getUnsafe(path, first)
    const end = EffectArray.getUnsafe(path, last)

    const farthest = path
      .slice(first + 1, last)
      .map((point, offset) => ({
        index: first + 1 + offset,
        distance: distanceToSegment({ point, start, end }),
      }))
      .reduce((best, candidate) => (candidate.distance > best.distance ? candidate : best), {
        index: -1,
        distance: tolerance,
      })

    if (farthest.index !== -1) {
      kept[farthest.index] = true
      pending.push([first, farthest.index], [farthest.index, last])
    }
  }

  return [EffectArray.headNonEmpty(path), ...path.slice(1).filter((_, index) => kept[index + 1])]
}

/**
 * A closed ring is split at its farthest vertex from the start, so both halves have distinct ends.
 * Returns `None` when the ring collapses below four positions.
 */
const simplifyRing = (ring: LinearRing, tolerance: number): Option.Option<LinearRing> => {
  const start = EffectArray.headNonEmpty(ring)
  const distanceFromStart = ([longitude, latitude]: Position) =>
    Math.hypot(longitude - start[0], latitude - start[1])
  const pivot = ring
    .slice(1, -1)
    .map((position, offset) => ({ index: offset + 1, distance: distanceFromStart(position) }))
    .reduce((best, candidate) => (candidate.distance > best.distance ? candidate : best)).index
  const firstHalf = simplifyPath([start, ...ring.slice(1, pivot + 1)], tolerance)
  const secondHalf = simplifyPath(
    [EffectArray.getUnsafe(ring, pivot), ...ring.slice(pivot + 1)],
    tolerance,
  )
  return Schema.decodeOption(LinearRing)([...firstHalf, ...secondHalf.slice(1)])
}

/**
 * Drops vertices closer than `tolerance` (in degrees) to the simplified outline.
 * Outer rings never disappear: when one would collapse, it's kept as it was.
 * Holes that collapse are dropped.
 */
export const simplifyArea = (geometry: AreaGeometry, tolerance: number): AreaGeometry => {
  const simplifyPolygon = ([outer, ...holes]: PolygonRings): PolygonRings => [
    Option.getOrElse(simplifyRing(outer, tolerance), () => outer),
    ...holes.flatMap((hole) => Option.toArray(simplifyRing(hole, tolerance))),
  ]
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: simplifyPolygon(geometry.coordinates) }
    : { type: "MultiPolygon", coordinates: EffectArray.map(geometry.coordinates, simplifyPolygon) }
}

export const positionCount = (geometry: AreaGeometry): number =>
  polygonsOf(geometry).reduce(
    (sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0),
    0,
  )
