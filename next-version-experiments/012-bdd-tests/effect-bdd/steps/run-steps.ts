import { Effect, Option, Schema } from 'effect'
import { BackgroundContext, ScenarioContext } from '../context'
import {
	StepCountMismatchError,
	StepMatchError,
	StepValidationError,
} from '../errors'
import {
	decodeParams,
	extractParams,
	matchPattern,
} from '../parser/pattern-matcher'
import type { ParsedStep } from '../parser/types'
import type { Step } from './step'

interface ValidationResult {
	valid: boolean
	mismatches: Array<{
		index: number
		featureStep: string
		providedPattern: string
		reason: string
	}>
}

function validateSteps(
	steps: Step<unknown, unknown, unknown, unknown>[],
	parsedSteps: readonly ParsedStep[],
): ValidationResult {
	const mismatches: ValidationResult['mismatches'] = []

	// Check each step pair
	const minLength = Math.min(steps.length, parsedSteps.length)
	for (let i = 0; i < minLength; i++) {
		const step = steps[i]
		const parsedStep = parsedSteps[i]

		const matched = matchPattern(step.pattern, parsedStep.text)
		if (matched === null) {
			// Try to provide a helpful reason
			let reason = 'Pattern does not match step text'

			// Check if it's a similar pattern but different (visible vs not visible)
			if (step.pattern.includes('not') !== parsedStep.text.includes('not')) {
				reason = step.pattern.includes('not')
					? 'Handler expects "not" but feature step is positive'
					: 'Feature step has "not" but handler is for positive case'
			} else if (
				step.pattern.includes('{string:') &&
				!parsedStep.text.includes('"')
			) {
				reason =
					'Handler expects a quoted string parameter but none found in feature step'
			} else if (!step.pattern.includes('{') && parsedStep.text.includes('"')) {
				reason =
					'Feature step has parameters but handler pattern has no placeholders'
			}

			mismatches.push({
				index: i,
				featureStep: parsedStep.text,
				providedPattern: step.pattern,
				reason,
			})
		}
	}

	return {
		valid: mismatches.length === 0,
		mismatches,
	}
}

function runStepsImpl(
	...steps: Step<unknown, unknown, unknown, unknown>[]
): Effect.Effect<unknown, unknown, unknown> {
	return Effect.gen(function* () {
		const bgCtx = yield* Effect.serviceOption(BackgroundContext).pipe(
			Effect.map(Option.getOrElse(() => ({}))),
		)

		const { steps: parsedSteps } = yield* Effect.serviceOption(
			ScenarioContext,
		).pipe(
			Effect.map(
				Option.getOrElse(() => ({
					name: '',
					steps: [] as readonly ParsedStep[],
				})),
			),
		)

		// =========================================================================
		// VALIDATION PHASE - Run before executing any steps
		// =========================================================================

		// 1. Check step count
		if (parsedSteps.length > 0 && steps.length !== parsedSteps.length) {
			return yield* Effect.fail(
				new StepCountMismatchError({
					feature: 'unknown',
					scenario: 'unknown',
					expectedCount: parsedSteps.length,
					actualCount: steps.length,
					featureSteps: parsedSteps.map((s) => `[${s.keyword}] ${s.text}`),
					providedPatterns: steps.map((s) => `[${s._tag}] ${s.pattern}`),
				}),
			)
		}

		// 2. Validate all step patterns match before running any
		if (parsedSteps.length > 0) {
			const validation = validateSteps(steps, parsedSteps)
			if (!validation.valid) {
				return yield* Effect.fail(
					new StepValidationError({
						scenario: 'unknown',
						mismatches: validation.mismatches,
						featureSteps: parsedSteps.map((s) => `[${s.keyword}] ${s.text}`),
						providedPatterns: steps.map((s) => `[${s._tag}] ${s.pattern}`),
					}),
				)
			}
		}

		// =========================================================================
		// EXECUTION PHASE - All validations passed
		// =========================================================================

		let ctx: unknown = bgCtx

		for (let i = 0; i < steps.length; i++) {
			const step = steps[i]
			const parsedStep = parsedSteps[i]

			let extractedParams: Record<string, unknown> = {}

			if (parsedStep) {
				const matched = extractParams(
					step.pattern,
					parsedStep.text,
					parsedStep.dataTable,
				)

				// This shouldn't happen after validation, but keep as safety net
				if (matched === null) {
					return yield* Effect.fail(
						new StepMatchError({
							pattern: step.pattern,
							text: parsedStep.text,
							feature: 'unknown',
						}),
					)
				}

				extractedParams = matched
			}

			const schema = step.config.params ?? Schema.Struct({})
			const params = yield* decodeParams(schema, extractedParams, step.pattern)
			ctx = yield* step.config.handler(ctx, params)
		}

		return ctx
	})
}

// ... all the overloads remain the same ...

// @ts-expect-error not sure what's the issue
export function runSteps<A, E1, R1>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
): Effect.Effect<A, E1, R1 | BackgroundContext | ScenarioContext>

export function runSteps<A, B, E1, E2, R1, R2>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
): Effect.Effect<B, E1 | E2, R1 | R2 | BackgroundContext | ScenarioContext>

export function runSteps<A, B, C, E1, E2, E3, R1, R2, R3>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
): Effect.Effect<
	C,
	E1 | E2 | E3,
	R1 | R2 | R3 | BackgroundContext | ScenarioContext
>

export function runSteps<A, B, C, D, E1, E2, E3, E4, R1, R2, R3, R4>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
): Effect.Effect<
	D,
	E1 | E2 | E3 | E4,
	R1 | R2 | R3 | R4 | BackgroundContext | ScenarioContext
>

export function runSteps<A, B, C, D, E, E1, E2, E3, E4, E5, R1, R2, R3, R4, R5>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
): Effect.Effect<
	E,
	E1 | E2 | E3 | E4 | E5,
	R1 | R2 | R3 | R4 | R5 | BackgroundContext | ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
): Effect.Effect<
	F,
	E1 | E2 | E3 | E4 | E5 | E6,
	R1 | R2 | R3 | R4 | R5 | R6 | BackgroundContext | ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
): Effect.Effect<
	G,
	E1 | E2 | E3 | E4 | E5 | E6 | E7,
	R1 | R2 | R3 | R4 | R5 | R6 | R7 | BackgroundContext | ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
): Effect.Effect<
	H,
	E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8,
	R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | BackgroundContext | ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	E9,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
	R9,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
	s9: Step<H, I, E9, R9>,
): Effect.Effect<
	I,
	E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9,
	| R1
	| R2
	| R3
	| R4
	| R5
	| R6
	| R7
	| R8
	| R9
	| BackgroundContext
	| ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	E9,
	E10,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
	R9,
	R10,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
	s9: Step<H, I, E9, R9>,
	s10: Step<I, J, E10, R10>,
): Effect.Effect<
	J,
	E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 | E10,
	| R1
	| R2
	| R3
	| R4
	| R5
	| R6
	| R7
	| R8
	| R9
	| R10
	| BackgroundContext
	| ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	E9,
	E10,
	E11,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
	R9,
	R10,
	R11,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
	s9: Step<H, I, E9, R9>,
	s10: Step<I, J, E10, R10>,
	s11: Step<J, K, E11, R11>,
): Effect.Effect<
	K,
	E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 | E10 | E11,
	| R1
	| R2
	| R3
	| R4
	| R5
	| R6
	| R7
	| R8
	| R9
	| R10
	| R11
	| BackgroundContext
	| ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	E9,
	E10,
	E11,
	E12,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
	R9,
	R10,
	R11,
	R12,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
	s9: Step<H, I, E9, R9>,
	s10: Step<I, J, E10, R10>,
	s11: Step<J, K, E11, R11>,
	s12: Step<K, L, E12, R12>,
): Effect.Effect<
	L,
	E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 | E10 | E11 | E12,
	| R1
	| R2
	| R3
	| R4
	| R5
	| R6
	| R7
	| R8
	| R9
	| R10
	| R11
	| R12
	| BackgroundContext
	| ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	E9,
	E10,
	E11,
	E12,
	E13,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
	R9,
	R10,
	R11,
	R12,
	R13,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
	s9: Step<H, I, E9, R9>,
	s10: Step<I, J, E10, R10>,
	s11: Step<J, K, E11, R11>,
	s12: Step<K, L, E12, R12>,
	s13: Step<L, M, E13, R13>,
): Effect.Effect<
	M,
	E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 | E10 | E11 | E12 | E13,
	| R1
	| R2
	| R3
	| R4
	| R5
	| R6
	| R7
	| R8
	| R9
	| R10
	| R11
	| R12
	| R13
	| BackgroundContext
	| ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	E9,
	E10,
	E11,
	E12,
	E13,
	E14,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
	R9,
	R10,
	R11,
	R12,
	R13,
	R14,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
	s9: Step<H, I, E9, R9>,
	s10: Step<I, J, E10, R10>,
	s11: Step<J, K, E11, R11>,
	s12: Step<K, L, E12, R12>,
	s13: Step<L, M, E13, R13>,
	s14: Step<M, N, E14, R14>,
): Effect.Effect<
	N,
	E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 | E10 | E11 | E12 | E13 | E14,
	| R1
	| R2
	| R3
	| R4
	| R5
	| R6
	| R7
	| R8
	| R9
	| R10
	| R11
	| R12
	| R13
	| R14
	| BackgroundContext
	| ScenarioContext
>

export function runSteps<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	O,
	E1,
	E2,
	E3,
	E4,
	E5,
	E6,
	E7,
	E8,
	E9,
	E10,
	E11,
	E12,
	E13,
	E14,
	E15,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
	R8,
	R9,
	R10,
	R11,
	R12,
	R13,
	R14,
	R15,
>(
	s1: Step<Record<string, unknown>, A, E1, R1>,
	s2: Step<A, B, E2, R2>,
	s3: Step<B, C, E3, R3>,
	s4: Step<C, D, E4, R4>,
	s5: Step<D, E, E5, R5>,
	s6: Step<E, F, E6, R6>,
	s7: Step<F, G, E7, R7>,
	s8: Step<G, H, E8, R8>,
	s9: Step<H, I, E9, R9>,
	s10: Step<I, J, E10, R10>,
	s11: Step<J, K, E11, R11>,
	s12: Step<K, L, E12, R12>,
	s13: Step<L, M, E13, R13>,
	s14: Step<M, N, E14, R14>,
	s15: Step<N, O, E15, R15>,
): Effect.Effect<
	O,
	| E1
	| E2
	| E3
	| E4
	| E5
	| E6
	| E7
	| E8
	| E9
	| E10
	| E11
	| E12
	| E13
	| E14
	| E15,
	| R1
	| R2
	| R3
	| R4
	| R5
	| R6
	| R7
	| R8
	| R9
	| R10
	| R11
	| R12
	| R13
	| R14
	| R15
	| BackgroundContext
	| ScenarioContext
>

export function runSteps(
	...steps: Step<unknown, unknown, unknown, unknown>[]
): Effect.Effect<unknown, unknown, unknown> {
	return runStepsImpl(...steps)
}
