/**
 * Shared test helpers for property-based testing with Effect.
 *
 * Import from `@gororobas/domain/testing` in downstream packages.
 */
import { Cause, DateTime, Effect, Exit, Layer } from "effect"
import { UnknownError } from "effect/Cause"
import { FastCheck } from "effect/testing"

import type { Session } from "./authorization/session.js"
import { SessionContext } from "./authorization/session.js"

export interface PropertyResult<A> {
  readonly success: boolean
  readonly numRuns: number
  readonly counterexample: A | undefined
  readonly seed: number | undefined
  readonly error: unknown
}

export class PropertyTestFailure extends Error {
  readonly _tag = "PropertyTestFailure"
  constructor(
    readonly counterexample: unknown,
    readonly seed: number,
    readonly path: string,
  ) {
    super(`Property failed with counterexample: ${JSON.stringify(counterexample)}`)
  }
}

/**
 * Run property test that returns an Effect<boolean>
 * Uses FastCheck.check internally but wraps everything in Effect
 */
export const checkPropertyEffect = <A, E>(
  arbitrary: FastCheck.Arbitrary<A>,
  predicate: (value: A) => Effect.Effect<boolean, E, never>,
): Effect.Effect<PropertyResult<A>, E | UnknownError, never> =>
  Effect.gen(function* () {
    let counterexample: A | undefined
    let lastError: unknown

    const asyncProp = FastCheck.asyncProperty(arbitrary, async (value) => {
      const result = await Effect.runPromiseExit(predicate(value))

      if (result._tag === "Failure") {
        lastError = Cause.squash(result.cause)
        counterexample = value
        return false
      }

      if (!result.value) {
        counterexample = value
        return false
      }

      return true
    })

    const checkResult = yield* Effect.tryPromise({
      catch: (unknown) => new UnknownError({ cause: unknown }),
      try: () => FastCheck.check(asyncProp),
    })

    return {
      counterexample,
      error: lastError,
      numRuns: checkResult.numRuns,
      seed: checkResult.seed,
      success: !checkResult.failed,
    }
  })

/**
 * Assert property with detailed failure information
 */
export const assertPropertyEffect = <A, E>(
  arbitrary: FastCheck.Arbitrary<A>,
  predicate: (value: A) => Effect.Effect<boolean, E, never>,
): Effect.Effect<void, E | PropertyTestFailure | UnknownError, never> =>
  Effect.gen(function* () {
    const result = yield* checkPropertyEffect(arbitrary, predicate)

    if (!result.success) {
      return yield* Effect.fail(
        new PropertyTestFailure(
          result.counterexample,
          result.seed ?? 0,
          result.error?.toString() ?? "",
        ),
      )
    }
  })

/**
 * Effectful property with preconditions
 */
export const propertyWithPrecondition = <A, E>(
  arbitrary: FastCheck.Arbitrary<A>,
  precondition: (value: A) => boolean,
  predicate: (value: A) => Effect.Effect<boolean, E, never>,
): Effect.Effect<void, E | PropertyTestFailure | UnknownError, never> =>
  assertPropertyEffect(arbitrary.filter(precondition), predicate)

/**
 * Run a policy effect with a session and return the Exit
 */
export const runPolicy = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  session: Session,
): Effect.Effect<Exit.Exit<A, E>, never, Exclude<R, SessionContext>> =>
  effect.pipe(Effect.provide(Layer.succeed(SessionContext, session)), Effect.exit)

/**
 * Run a policy effect with a session and return whether it succeeded
 */
export const runPolicySuccess = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  session: Session,
): Effect.Effect<boolean, never, Exclude<R, SessionContext>> =>
  Effect.map(runPolicy(effect, session), Exit.isSuccess)

/**
 * Deep equality check that handles special types like Uint8Array and DateTime.
 * This is needed because Equal.equals() doesn't handle all schema types correctly.
 */
export function deepEquals(a: unknown, b: unknown): boolean {
  // Handle null/undefined/NaN — JSON.stringify converts undefined (in arrays)
  // and NaN to null, and strips undefined-valued object keys.
  const isNullish = (v: unknown) =>
    v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))
  if (a === b) return true
  if (isNullish(a) && isNullish(b)) return true
  if (a == null || b == null) return false

  // Handle DateTime using DateTime.Equivalence
  if (DateTime.isDateTime(a) && DateTime.isDateTime(b)) {
    return DateTime.Equivalence(a, b)
  }

  // Handle Uint8Array
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false
    }
    return true
  }

  // Handle objects
  if (typeof a === "object" && typeof b === "object") {
    // Filter out keys with undefined values since JSON round-trips erase
    // the distinction between {key: undefined} and a missing key.
    const definedKeys = (obj: object) =>
      Object.keys(obj).filter((k) => (obj as any)[k] !== undefined)
    const aKeys = definedKeys(a as object)
    const bKeys = definedKeys(b as object)

    if (aKeys.length !== bKeys.length) return false

    for (const key of aKeys) {
      if (!bKeys.includes(key)) return false
      if (!deepEquals((a as any)[key], (b as any)[key])) return false
    }

    return true
  }

  // Fallback to strict equality
  return false
}
