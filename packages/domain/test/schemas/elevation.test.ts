import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Length from "effect-units/Length"
import * as Arbitrary from "effect/Arbitrary"

import { ElevationInMeters } from "../../src/profiles/locations.js"
import { assertPropertyEffect } from "../../src/testing.js"

const DeviceAltitude = Schema.Finite.check(Schema.isBetween({ minimum: -500, maximum: 9000 }))

describe("ElevationInMeters", () => {
  it.effect("keeps a device's altitude to the nearest 10 meters, in storage and as a length", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(DeviceAltitude),
      predicate: (altitude) =>
        Effect.gen(function* () {
          const elevation = yield* Schema.decodeEffect(ElevationInMeters)(altitude)
          const stored = yield* Schema.encodeEffect(ElevationInMeters)(elevation)

          return (
            stored % 10 === 0 &&
            Math.abs(stored - altitude) <= 5 &&
            Length.inMeters(elevation) === stored &&
            Length.inCentimeters(elevation) === stored * 100
          )
        }),
    }),
  )
})
