import { describe, expect, it } from "@effect/vitest"
import { Array as EffectArray, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import {
  type AreaGeometry,
  areaContains,
  geometryToBoundingBox,
  boundingBoxContains,
  type LinearRing,
  LinearRing as LinearRingSchema,
  positionCount,
  simplifyArea,
} from "../../src/places/geometry.js"
import { assertProperty } from "../../src/testing.js"

const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Finite.check(Schema.isBetween({ minimum, maximum })))

/**
 * A polygon that's star-shaped around its center: vertices at evenly spaced angles, each nudged
 * less than the spacing. With five or more, no gap between vertices reaches half a turn, so the
 * center sees every edge and lies strictly inside.
 */
const starArbitrary = Arbitrary.flatMap(
  Arbitrary.all({
    center: Arbitrary.all({ longitude: between(-170, 170), latitude: between(-80, 80) }),
    vertexCount: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 40 }))),
  }),
  ({ center, vertexCount }) =>
    Arbitrary.map(
      Arbitrary.array(Arbitrary.all({ jitter: between(-0.4, 0.4), radius: between(0.1, 5) }), {
        minLength: vertexCount,
        maxLength: vertexCount,
      }),
      (vertices) => ({ center, vertices }),
    ),
)

type Star = typeof starArbitrary extends Arbitrary.Arbitrary<infer A> ? A : never

const ring = ({ center, vertices }: Star, scale = 1): LinearRing => {
  const spacing = (2 * Math.PI) / vertices.length

  const positions = vertices.map(({ jitter, radius }, index): readonly [number, number] => {
    const angle = (index + jitter) * spacing
    return [
      center.longitude + scale * radius * Math.cos(angle),
      center.latitude + scale * radius * Math.sin(angle),
    ]
  })

  if (!EffectArray.isArrayNonEmpty(positions)) throw new Error("Stars have five or more vertices")
  return Schema.decodeSync(LinearRingSchema)([...positions, EffectArray.headNonEmpty(positions)])
}

const polygon = (star: Star): AreaGeometry => ({ type: "Polygon", coordinates: [ring(star)] })

describe("area geometry", () => {
  it("contains the center of a star-shaped polygon", () => {
    assertProperty({
      arbitrary: starArbitrary,
      predicate: (star) => {
        expect(areaContains(polygon(star), star.center)).toBe(true)
        return true
      },
    })
  })

  it("excludes the center when it falls in a hole", () => {
    assertProperty({
      arbitrary: starArbitrary,
      predicate: (star) => {
        const withHole: AreaGeometry = {
          type: "Polygon",
          coordinates: [ring(star), ring(star, 0.3)],
        }
        expect(areaContains(withHole, star.center)).toBe(false)
        return true
      },
    })
  })

  it("never contains points outside its bounding box", () => {
    assertProperty({
      arbitrary: Arbitrary.all({
        star: starArbitrary,
        point: Arbitrary.all({ longitude: between(-180, 180), latitude: between(-90, 90) }),
      }),
      predicate: ({ star, point }) => {
        const area = polygon(star)
        // Containment implies being inside the bounds.
        expect(
          !areaContains(area, point) || boundingBoxContains(geometryToBoundingBox(area), point),
        ).toBe(true)
        return true
      },
    })
  })

  it("simplifies to fewer vertices within the original bounds, keeping rings valid", () => {
    assertProperty({
      arbitrary: Arbitrary.all({ star: starArbitrary, tolerance: between(0, 3) }),
      predicate: ({ star, tolerance }) => {
        const area = polygon(star)
        const simplified = simplifyArea(area, tolerance)
        const bounds = geometryToBoundingBox(area)
        const simplifiedBounds = geometryToBoundingBox(simplified)

        expect(
          simplified.type === "Polygon" && Schema.is(LinearRingSchema)(simplified.coordinates[0]),
        ).toBe(true)
        expect(positionCount(simplified)).toBeLessThanOrEqual(positionCount(area))
        expect(simplifiedBounds.minLongitude).toBeGreaterThanOrEqual(bounds.minLongitude)
        expect(simplifiedBounds.maxLongitude).toBeLessThanOrEqual(bounds.maxLongitude)
        expect(simplifiedBounds.minLatitude).toBeGreaterThanOrEqual(bounds.minLatitude)
        expect(simplifiedBounds.maxLatitude).toBeLessThanOrEqual(bounds.maxLatitude)
        return true
      },
    })
  })
})
