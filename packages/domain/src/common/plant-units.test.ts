import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import * as Length from "effect-units/Length"
import * as Temperature from "effect-units/Temperature"
import * as Arbitrary from "effect/Arbitrary"
import { LoroDoc } from "loro-crdt"

import { assertPropertyEffect } from "../testing.js"
import { WikiPlantCultivarArticle } from "../wiki/kinds/plant-cultivar.js"
import { WikiPlantArticleCrdtOperations } from "../wiki/kinds/plant.crdt.js"
import { WikiPlantArticle } from "../wiki/kinds/plant.js"
import { Centimeters, TemperatureInCelsius } from "./primitives.js"

const StoredMeasurements = Schema.Struct({
  height: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100000 })),
  temperature: Schema.Finite.check(Schema.isBetween({ minimum: -50, maximum: 100 })),
})

describe("Plant unit storage", () => {
  it.effect("round-trips numeric CRDT edits and materialized attributes", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(StoredMeasurements),
      predicate: ({ height, temperature }) =>
        Effect.gen(function* () {
          const document = new LoroDoc()

          for (const edit of [
            { _tag: "SetHeightMax", value: height },
            { _tag: "SetTemperatureMin", value: temperature },
          ]) {
            yield* WikiPlantArticleCrdtOperations.applyAttributeEdit(
              document,
              Schema.decodeUnknownSync(WikiPlantArticleCrdtOperations.AttributeEdit)(edit),
            )
          }

          const editable = Schema.decodeUnknownSync(WikiPlantArticle.EditableAttributes)(
            document.getMap("attributes").toJSON(),
          )
          const materialized = WikiPlantArticle.materializeAttributes(editable)
          const codec = Schema.fromJsonString(WikiPlantArticle.MaterializedAttributes)
          const decoded = Schema.decodeUnknownSync(codec)(Schema.encodeSync(codec)(materialized))
          const decodedHeight = Option.getOrThrow(decoded.heightMax)
          const decodedTemperature = Option.getOrThrow(decoded.temperatureMin)
          expect(document.getMap("attributes").get("heightMax")).toBe(height)
          expect(document.getMap("attributes").get("temperatureMin")).toBeCloseTo(temperature, 10)
          expect(Length.inMeters(decodedHeight)).toBeCloseTo(height / 100, 10)
          expect(Temperature.inDegreesFahrenheit(decodedTemperature)).toBeCloseTo(
            temperature * 1.8 + 32,
            10,
          )
          return Schema.encodeSync(Centimeters)(decodedHeight) === height
        }),
    }),
  )

  it("rounds computed lengths to whole centimeters without rejecting conversion noise", () => {
    for (const height of [0, 7, 29, 57]) {
      expect(Schema.encodeSync(Centimeters)(Schema.decodeUnknownSync(Centimeters)(height))).toBe(
        height,
      )
    }

    expect(Schema.encodeSync(Centimeters)(Length.centimeters(7.4))).toBe(7)
    expect(Schema.encodeSync(Centimeters)(Length.centimeters(7.5))).toBe(8)
    for (const invalid of [-1, 0.5, NaN, Infinity]) {
      expect(() => Schema.decodeUnknownSync(Centimeters)(invalid)).toThrow(/Expected/)
    }
    for (const invalid of [-0.1, NaN, Infinity]) {
      expect(() => Schema.encodeSync(Centimeters)(Length.centimeters(invalid))).toThrow(/Expected/)
    }
  })

  it("accepts freezing temperatures while enforcing the Celsius lower bound in both directions", () => {
    for (const celsius of [-50, -20, 0, 20]) {
      const temperature = Schema.decodeUnknownSync(TemperatureInCelsius)(celsius)
      expect(Schema.encodeSync(TemperatureInCelsius)(temperature)).toBe(celsius)
    }

    for (const invalid of [-51, NaN, Infinity, -Infinity]) {
      expect(() => Schema.decodeUnknownSync(TemperatureInCelsius)(invalid)).toThrow(/Expected/)
      expect(() =>
        Schema.encodeSync(TemperatureInCelsius)(Temperature.degreesCelsius(invalid)),
      ).toThrow(/Expected/)
    }
  })

  it("compares cultivar range endpoints as quantities and retains numeric JSON", () => {
    const Fields = Schema.Struct({
      height: WikiPlantCultivarArticle.EditableAttributes.fields.height,
      temperature: WikiPlantCultivarArticle.EditableAttributes.fields.temperature,
    })
    const stored = {
      height: { _tag: "Value", value: { min: 7, max: 29 } },
      temperature: { _tag: "Value", value: { min: -50, max: 20 } },
    }
    expect(
      Schema.encodeSync(Schema.toCodecJson(Fields))(Schema.decodeUnknownSync(Fields)(stored)),
    ).toEqual(stored)

    for (const field of [Fields.fields.height, Fields.fields.temperature]) {
      expect(() =>
        Schema.decodeUnknownSync(field)({ _tag: "Value", value: { min: 20, max: 7 } }),
      ).toThrow(/minimum must not exceed maximum/)
    }
  })
})
