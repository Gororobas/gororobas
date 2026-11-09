import { describe, it } from "@effect/vitest"
import { Array as EffectArray, Effect, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import {
  FractionalIndex,
  keyBetween,
} from "../../src/claim-based-architecture-experiment/values/fractional-index.js"
import { assertPropertyEffect } from "../../src/testing.js"

/** Where to insert each key, as an index into the keys so far (taken modulo their count + 1). */
const Insertions = Schema.Array(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
).check(Schema.isMaxLength(60))

describe("fractional indexes", () => {
  it.effect("inserting anywhere keeps keys valid and in order", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Insertions),
      predicate: (insertions) =>
        Effect.sync(() => {
          const keys = EffectArray.reduce(
            insertions,
            EffectArray.empty<FractionalIndex>(),
            (current, insertion) => {
              const at = insertion % (current.length + 1)
              const key = keyBetween(EffectArray.get(current, at - 1), EffectArray.get(current, at))
              return [...current.slice(0, at), key, ...current.slice(at)]
            },
          )

          return (
            keys.every(Schema.is(FractionalIndex)) &&
            keys.every((key, index) =>
              Option.match(EffectArray.get(keys, index - 1), {
                onNone: () => true,
                onSome: (previous) => previous < key,
              }),
            )
          )
        }),
    }),
  )
})
