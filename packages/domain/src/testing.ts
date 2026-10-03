/**
 * Shared test helpers for property-based testing with Effect.
 *
 * Import from `@gororobas/domain/testing` in downstream packages.
 */
import {
  Array as EffectArray,
  DateTime,
  Effect,
  Exit,
  Layer,
  Predicate,
  Record,
  Schema,
} from "effect"
import * as Arbitrary from "effect/Arbitrary"

import type { Session } from "./authorization/session.js"
import { SessionContext } from "./authorization/session.js"

export class PropertyTestFailure extends Error {
  readonly _tag = "PropertyTestFailure"
  constructor(
    readonly counterexample: unknown,
    readonly seed: number,
    readonly path: string,
  ) {
    super(
      `Property failed with counterexample: ${Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(counterexample)}`,
    )
  }
}

/**
 * Run an Effect-native property check.
 */
export const checkPropertyEffect = <A, E, R>(
  arbitrary: Arbitrary.Arbitrary<A>,
  predicate: (value: A) => Effect.Effect<boolean, E, R>,
  options?: Arbitrary.CheckOptions,
): Effect.Effect<Arbitrary.CheckResult<A, E>, never, R> =>
  Arbitrary.checkEffect(arbitrary, predicate, options)

/**
 * Assert property with detailed failure information
 */
export const assertPropertyEffect = <A, E, R>(
  arbitrary: Arbitrary.Arbitrary<A>,
  predicate: (value: A) => Effect.Effect<boolean, E, R>,
  options?: Arbitrary.CheckOptions,
): Effect.Effect<void, PropertyTestFailure, R> =>
  Effect.gen(function* () {
    const result = yield* checkPropertyEffect(arbitrary, predicate, {
      runs: 50,
      ...options,
    })

    if (result._tag === "Passed") return
    if (result._tag === "Falsified") {
      return yield* Effect.fail(new PropertyTestFailure(result.shrunkInput, 0, result.replay))
    }
    return yield* Effect.fail(new PropertyTestFailure(result, 0, ""))
  })

/**
 * Effectful property with preconditions
 */
export const propertyWithPrecondition = <A, E, R>(
  arbitrary: Arbitrary.Arbitrary<A>,
  precondition: (value: A) => boolean,
  predicate: (value: A) => Effect.Effect<boolean, E, R>,
): Effect.Effect<void, PropertyTestFailure, R> =>
  assertPropertyEffect(Arbitrary.filter(arbitrary, precondition), predicate)

export const assertProperty = <A>(
  arbitrary: Arbitrary.Arbitrary<A>,
  predicate: (value: A) => boolean,
  options?: Arbitrary.CheckOptions,
): void => {
  const result = Effect.runSync(Arbitrary.checkEffect(arbitrary, predicate, options))
  if (result._tag !== "Passed") {
    throw new PropertyTestFailure(
      result._tag === "Falsified" ? result.shrunkInput : result,
      0,
      result._tag === "Falsified" ? result.replay : "",
    )
  }
}

/**
 * Run a policy effect with a session and return the Exit
 */
export const runPolicy = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  session: Session,
): Effect.Effect<Exit.Exit<A, E>, never, Exclude<R, SessionContext>> =>
  effect.pipe(Effect.provide(Layer.succeed(SessionContext)(session)), Effect.exit)

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
    v === null || v === undefined || (Predicate.isNumber(v) && !Number.isFinite(v))
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
    return Array.from(a).every((value, index) => value === b[index])
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return EffectArray.every(a, (value, index) => deepEquals(value, b[index]))
  }

  // Handle objects
  if (Predicate.isObject(a) && Predicate.isObject(b)) {
    // Filter out keys with undefined values since JSON round-trips erase
    // the distinction between {key: undefined} and a missing key.
    const definedKeys = (obj: Record<PropertyKey, unknown>) =>
      Record.keys(obj).filter((k) => obj[k] !== undefined)
    const aKeys = definedKeys(a)
    const bKeys = definedKeys(b)

    if (aKeys.length !== bKeys.length) return false

    return EffectArray.every(aKeys, (key) => bKeys.includes(key) && deepEquals(a[key], b[key]))
  }

  // Fallback to strict equality
  return false
}
