// test/effect-property-advanced.ts
import { Cause, Effect, FastCheck } from 'effect'
import type { UnknownException } from 'effect/Cause'

export interface PropertyResult<A> {
	readonly success: boolean
	readonly numRuns: number
	readonly counterexample?: A
	readonly seed?: number
	readonly error?: unknown
}

export class PropertyTestFailure extends Error {
	readonly _tag = 'PropertyTestFailure'
	constructor(
		readonly counterexample: unknown,
		readonly seed: number,
		readonly path: string,
	) {
		super(
			`Property failed with counterexample: ${JSON.stringify(counterexample)}`,
		)
	}
}

/**
 * Run property test that returns an Effect<boolean>
 * Uses FastCheck.check internally but wraps everything in Effect
 */
export const checkPropertyEffect = <A, E>(
	arbitrary: FastCheck.Arbitrary<A>,
	predicate: (value: A) => Effect.Effect<boolean, E, never>,
	params?: FastCheck.Parameters<A>,
): Effect.Effect<PropertyResult<A>, E | UnknownException, never> =>
	Effect.gen(function* () {
		let counterexample: A | undefined
		let lastError: unknown

		const asyncProp = FastCheck.asyncProperty(arbitrary, async (value) => {
			const result = await Effect.runPromiseExit(predicate(value))

			if (result._tag === 'Failure') {
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

		const checkResult = yield* Effect.tryPromise(() =>
			// @ts-expect-error vibe coded, not sure what happens here
			FastCheck.check(asyncProp, params),
		)

		return {
			success: !checkResult.failed,
			numRuns: checkResult.numRuns,
			counterexample,
			seed: checkResult.seed,
			error: lastError,
		} satisfies PropertyResult<A>
	})

/**
 * Assert property with detailed failure information
 */
export const assertPropertyEffect = <A, E>(
	arbitrary: FastCheck.Arbitrary<A>,
	predicate: (value: A) => Effect.Effect<boolean, E, never>,
	params?: FastCheck.Parameters<A>,
): Effect.Effect<void, E | PropertyTestFailure | UnknownException, never> =>
	Effect.gen(function* () {
		const result = yield* checkPropertyEffect(arbitrary, predicate, params)

		if (!result.success) {
			return yield* Effect.fail(
				new PropertyTestFailure(
					result.counterexample,
					result.seed ?? 0,
					result.error?.toString() ?? '',
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
	params?: FastCheck.Parameters<A>,
): Effect.Effect<void, E | PropertyTestFailure | UnknownException, never> =>
	assertPropertyEffect(arbitrary.filter(precondition), predicate, params)
