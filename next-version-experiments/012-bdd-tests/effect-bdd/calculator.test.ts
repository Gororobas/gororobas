import { expect, it } from '@effect/vitest'
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
// Minimal Service Setup
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

// Layer that creates the state ref
const CalculatorStateLayer = Layer.effect(
	CalculatorStateRef,
	Ref.make<CalculatorState>({ value: 0, history: [] }),
)

// Layer that creates the service (depends on state ref)
const CalculatorServiceLive = Layer.effect(
	CalculatorService,
	Effect.gen(function* () {
		console.log(
			'🔧 Creating CalculatorService, requesting CalculatorStateRef...',
		)
		const stateRef = yield* CalculatorStateRef
		console.log('✅ Got CalculatorStateRef')

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

// Combined layer - order matters!
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

it.effect('minimal', () =>
	Effect.gen(function* () {
		const calc = yield* CalculatorStateRef
		yield* calc.get
	}).pipe(Effect.provide(TestLayer)),
)

describeFeature(
	'./effect-gherkin/calculator.feature',
	({ Background, Scenario, ScenarioOutline }) => {
		// Test 1: Background with services
		Background({
			// layer: TestLayer,
			steps: () =>
				runSteps(
					Given('the calculator is reset', {
						handler: () =>
							Effect.gen(function* () {
								console.log('📍 Background: Resetting calculator...')
								const calc = yield* CalculatorService
								yield* calc.setValue(0)
								console.log('✅ Background: Calculator reset to 0')
								return initialContext
							}),
					}),
				),
		})

		// Test 2: Scenario that uses the service
		Scenario('Adding two numbers', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('I have entered {int:first} into the calculator', {
						params: Schema.Struct({ first: Schema.Int }),
						handler: (_, { first }) =>
							Effect.gen(function* () {
								console.log(`📍 Step 1: Adding ${first}...`)
								const bgCtx = yield* getBackgroundContext<CalculatorContext>()
								const calc = yield* CalculatorService
								const newValue = yield* calc.add(first)
								console.log(`✅ Step 1: Value is now ${newValue}`)
								return { ...bgCtx, value: newValue }
							}),
					}),
					And('I have entered {int:second} into the calculator', {
						params: Schema.Struct({ second: Schema.Int }),
						handler: (ctx, { second }) =>
							Effect.gen(function* () {
								console.log(`📍 Step 2: Adding ${second}...`)
								const calc = yield* CalculatorService
								const newValue = yield* calc.add(second)
								console.log(`✅ Step 2: Value is now ${newValue}`)
								return { ...ctx, value: newValue }
							}),
					}),
					When('I press add', {
						handler: (ctx) =>
							Effect.gen(function* () {
								console.log('📍 Step 3: Press add (no-op)')
								const calc = yield* CalculatorService
								const history = yield* calc.getHistory()
								console.log(
									`✅ Step 3: History so far: ${JSON.stringify(history)}`,
								)
								return { ...ctx, history }
							}),
					}),
					Then('the result should be {int:result}', {
						params: Schema.Struct({ result: Schema.Int }),
						handler: (ctx, { result }) =>
							Effect.gen(function* () {
								console.log(`📍 Step 4: Checking result...`)
								const calc = yield* CalculatorService
								const value = yield* calc.getValue()
								console.log(`✅ Step 4: Expected ${result}, got ${value}`)
								expect(value).toBe(result)
								return ctx
							}),
					}),
				),
		})

		// Test 3: ScenarioOutline with services
		ScenarioOutline('Subtracting numbers', {
			layer: TestLayer,
			examples: [
				{ first: 10, second: 3, result: 7 },
				{ first: 5, second: 5, result: 0 },
				{ first: 0, second: 5, result: -5 },
			] as const,
			steps: () =>
				runSteps(
					Given('I have entered {int:first} into the calculator', {
						params: Schema.Struct({ first: Schema.Int }),
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
