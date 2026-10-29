import { describe, it } from "@effect/vitest"
import { Handle, stringToHandle } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Array as EffectArray, Effect, HashSet, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { allocateHandle } from "../src/common/handle-allocation.js"

describe("handle allocation", () => {
  it.effect("allocates the first available name's handle, or an available suffixed one", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.all({
        names: Arbitrary.schema(Schema.Array(Schema.String.check(Schema.isMaxLength(120)))),
        takenFlags: Arbitrary.schema(Schema.Array(Schema.Boolean)),
      }),
      predicate: ({ names, takenFlags }) =>
        Effect.gen(function* () {
          const handles = EffectArray.getSomes(
            yield* Effect.forEach(names, (name) => Effect.option(stringToHandle(name)), {
              concurrency: 1,
            }),
          )

          const taken = HashSet.fromIterable(
            handles.filter((_, index) => takenFlags[index] ?? false),
          )
          const isAvailable = (handle: Handle) => Effect.succeed(!HashSet.has(taken, handle))

          const allocated = yield* allocateHandle({ names, fallbackName: "pessoa", isAvailable })
          const firstAvailable = Option.fromUndefinedOr(
            handles.find((handle) => !HashSet.has(taken, handle)),
          )

          return (
            Schema.is(Handle)(allocated) &&
            !HashSet.has(taken, allocated) &&
            Option.match(firstAvailable, {
              onNone: () => true,
              onSome: (handle) => allocated === handle,
            })
          )
        }),
    }),
  )
})
