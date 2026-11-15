import { describe, it } from "@effect/vitest"
import { Array as EffectArray, Effect, Order, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { assertPropertyEffect } from "../testing.js"
import { quantile, tukeyFences } from "./statistics.js"

const Numbers = Schema.NonEmptyArray(
  Schema.Finite.check(Schema.isBetween({ minimum: -1e6, maximum: 1e6 })),
)

describe("statistics", () => {
  it.effect("a quantile stays within the values and grows with its fraction", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({ values: Numbers, lower: Schema.Finite, higher: Schema.Finite }),
      ),
      predicate: ({ values, lower, higher }) =>
        Effect.sync(() => {
          const sorted = EffectArray.sort(values, Order.Number)
          const at = (q: number) => quantile(sorted, q)
          const [qLow, qHigh] = EffectArray.sort(
            [lower % 1, higher % 1].map(Math.abs),
            Order.Number,
          )

          return (
            at(0) === sorted[0] &&
            at(1) === EffectArray.lastNonEmpty(sorted) &&
            at(qLow ?? 0) <= at(qHigh ?? 1)
          )
        }),
    }),
  )

  it.effect("Tukey's fences catch a value far beyond three or more others", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Numbers.check(Schema.isMinLength(3))),
      predicate: (values) =>
        Effect.sync(() => {
          const sorted = EffectArray.sort(values, Order.Number)
          const spread = EffectArray.lastNonEmpty(sorted) - sorted[0]
          const farOff = EffectArray.lastNonEmpty(sorted) + 100 * (spread + 1)
          return farOff > tukeyFences([...values, farOff]).upper
        }),
    }),
  )
})
