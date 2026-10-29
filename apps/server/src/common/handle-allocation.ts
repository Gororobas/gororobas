/**
 * The one way to give profiles, publications and wiki articles their handles.
 *
 * A handle someone chose is claimed as-is or rejected with `HandleTakenError`; a handle derived
 * from names takes the first available name and otherwise adds a random suffix to it. Callers say
 * what "available" means for their entity, since each entity has its own namespace and owners may
 * keep their current handles.
 */
import { type Handle, stringToHandle } from "@gororobas/domain"
import { HandleTakenError } from "@gororobas/domain/common/errors"
import { Array as EffectArray, Effect, Option, Random } from "effect"

export type HandleAvailability<E, R> = (handle: Handle) => Effect.Effect<boolean, E, R>

export const claimHandle = Effect.fn("claimHandle")(function* <E, R>(input: {
  handle: Handle
  entity: HandleTakenError["entity"]
  isAvailable: HandleAvailability<E, R>
}) {
  if (!(yield* input.isAvailable(input.handle))) {
    return yield* new HandleTakenError({ handle: input.handle, entity: input.entity })
  }
  return input.handle
})

/** A random suffix keeps the name readable without guessing how many namesakes exist. */
const MINIMUM_SUFFIX = 1000
const MAXIMUM_SUFFIX = 9999
/** Leaves room for the suffix within `Handle`'s 90 characters. */
const MAXIMUM_BASE_LENGTH = 90 - `-${MAXIMUM_SUFFIX}`.length

/**
 * The first of `names` whose handle is available, in order; otherwise the first name's handle
 * with a random suffix. `fallbackName` stands in when no name makes a valid handle.
 */
export const allocateHandle = Effect.fn("allocateHandle")(function* <E, R>(input: {
  names: ReadonlyArray<string>
  fallbackName: string
  isAvailable: HandleAvailability<E, R>
}) {
  const fromNames = EffectArray.dedupe(
    EffectArray.getSuccesses(
      yield* Effect.all(input.names.map(stringToHandle), {
        concurrency: "unbounded",
        mode: "result",
      }),
    ),
  )

  // Fallback names are written in code, and digits can't make a valid handle invalid.
  const candidates = EffectArray.isReadonlyArrayNonEmpty(fromNames)
    ? fromNames
    : EffectArray.of(yield* stringToHandle(input.fallbackName).pipe(Effect.orDie))

  const available = yield* Effect.findFirst(candidates, input.isAvailable)
  if (Option.isSome(available)) return available.value

  const base = EffectArray.headNonEmpty(candidates).slice(0, MAXIMUM_BASE_LENGTH)

  const suffixed = Effect.gen(function* () {
    const suffix = yield* Random.nextIntBetween(MINIMUM_SUFFIX, MAXIMUM_SUFFIX)
    const handle = yield* stringToHandle(`${base}-${suffix}`).pipe(Effect.orDie)
    return { handle, isAvailable: yield* input.isAvailable(handle) }
  })

  const allocated = yield* suffixed.pipe(Effect.repeat({ until: (result) => result.isAvailable }))
  return allocated.handle
})
