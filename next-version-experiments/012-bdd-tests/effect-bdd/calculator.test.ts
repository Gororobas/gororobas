import { expect } from '@effect/vitest'
import { Context, Effect, Layer, Ref, Schema } from 'effect'
import {
	And,
	describeFeature,
	Given,
	getBackgroundContext,
	runSteps,
	Then,
	When,
} from './index.ts'

// ============================================================================
// Minimal Service Setup (unchanged)
// ============================================================================

interface CalculatorState {
	value: number
	history: number[]
}

class CalculatorStateRef extends Context.Tag('CalculatorStateRef')<
	CalculatorStateRef,
	Ref.Ref<CalculatorState>
>() {}

interface CalculatorService {
	getValue: () => Effect.Effect<number>
	setValue: (n: number) => Effect.Effect<void>
	add: (n: number) => Effect.Effect<number>
	subtract: (n: number) => Effect.Effect<number>
	getHistory: () => Effect.Effect<number[]>
}

const CalculatorService =
	Context.GenericTag<CalculatorService>('CalculatorService')

const CalculatorStateLayer = Layer.effect(
	CalculatorStateRef,
	Ref.make<CalculatorState>({ value: 0, history: [] }),
)

const CalculatorServiceLive = Layer.effect(
	CalculatorService,
	Effect.gen(function* () {
		const stateRef = yield* CalculatorStateRef

		return CalculatorService.of({
			getValue: () =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					return state.value
				}),

			setValue: (n) =>
				Effect.gen(function* () {
					yield* Ref.update(stateRef, (s) => ({
						...s,
						value: n,
						history: [...s.history, n],
					}))
				}),

			add: (n) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const newValue = state.value + n
					yield* Ref.set(stateRef, {
						value: newValue,
						history: [...state.history, newValue],
					})
					return newValue
				}),

			subtract: (n) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const newValue = state.value - n
					yield* Ref.set(stateRef, {
						value: newValue,
						history: [...state.history, newValue],
					})
					return newValue
				}),

			getHistory: () =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					return state.history
				}),
		})
	}),
)

const TestLayer = CalculatorServiceLive.pipe(
	Layer.provideMerge(CalculatorStateLayer),
)

// ============================================================================
// Context Type
// ============================================================================

interface CalculatorContext {
	value: number
	history: number[]
}

const initialContext: CalculatorContext = {
	value: 0,
	history: [],
}

// ============================================================================
// Tests
// ============================================================================

describeFeature(
	'./012-bdd-tests/effect-bdd/calculator.feature',
	({ Background, Scenario, ScenarioOutline }) => {
		Background({
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('the calculator is reset', {
						handler: () =>
							Effect.gen(function* () {
								const calc = yield* CalculatorService
								yield* calc.setValue(0)
								return initialContext
							}),
					}),
				),
		})

		Scenario('Adding two numbers', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('I have entered {int:first} into the calculator', {
						params: Schema.Struct({ first: Schema.Int }),
						handler: (_, { first }) =>
							Effect.gen(function* () {
								const bgCtx = yield* getBackgroundContext<CalculatorContext>()
								const calc = yield* CalculatorService
								const newValue = yield* calc.add(first)
								return { ...bgCtx, value: newValue }
							}),
					}),
					And('I have entered {int:second} into the calculator', {
						params: Schema.Struct({ second: Schema.Int }),
						handler: (ctx, { second }) =>
							Effect.gen(function* () {
								const calc = yield* CalculatorService
								const newValue = yield* calc.add(second)
								return { ...ctx, value: newValue }
							}),
					}),
					When('I press add', {
						handler: (ctx) =>
							Effect.gen(function* () {
								const calc = yield* CalculatorService
								const history = yield* calc.getHistory()
								return { ...ctx, history }
							}),
					}),
					Then('the result should be {int:result}', {
						params: Schema.Struct({ result: Schema.Int }),
						handler: (ctx, { result }) =>
							Effect.gen(function* () {
								const calc = yield* CalculatorService
								const value = yield* calc.getValue()
								expect(value).toBe(result)
								return ctx
							}),
					}),
				),
		})

		ScenarioOutline('Subtracting numbers', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('I have entered {int:first} into the calculator', {
						params: Schema.Struct({ first: Schema.Int }),
						// `first` now comes from params (extracted from substituted step text)
						handler: (_, { first }) =>
							Effect.gen(function* () {
								const bgCtx = yield* getBackgroundContext<CalculatorContext>()
								const calc = yield* CalculatorService
								yield* calc.setValue(first)
								return { ...bgCtx, value: first }
							}),
					}),
					And('I have entered {int:second} into the calculator', {
						params: Schema.Struct({ second: Schema.Int }),
						handler: (ctx, { second }) =>
							Effect.gen(function* () {
								const calc = yield* CalculatorService
								const newValue = yield* calc.subtract(second)
								return { ...ctx, value: newValue }
							}),
					}),
					When('I press subtract', {
						handler: (ctx) => Effect.succeed(ctx),
					}),
					Then('the result should be {int:result}', {
						params: Schema.Struct({ result: Schema.Int }),
						handler: (ctx, { result }) =>
							Effect.gen(function* () {
								const calc = yield* CalculatorService
								const value = yield* calc.getValue()
								expect(value).toBe(result)
								return ctx
							}),
					}),
				),
		})
	},
)
