import { expect } from "@effect/vitest"
import { Context, Effect, Layer, Ref, Schema } from "effect"

import {
  And,
  describeFeature,
  Given,
  getBackgroundContext,
  runSteps,
  Then,
  When,
} from "../src/index.ts"

// ============================================================================
// Minimal Service Setup (unchanged)
// ============================================================================

interface CalculatorState {
  value: number
  history: Array<number>
}

class CalculatorStateRef extends Context.Tag("CalculatorStateRef")<
  CalculatorStateRef,
  Ref.Ref<CalculatorState>
>() {}

interface CalculatorService {
  getValue: () => Effect.Effect<number>
  setValue: (n: number) => Effect.Effect<void>
  add: (n: number) => Effect.Effect<number>
  subtract: (n: number) => Effect.Effect<number>
  getHistory: () => Effect.Effect<Array<number>>
}

const CalculatorService = Context.GenericTag<CalculatorService>("CalculatorService")

const CalculatorStateLayer = Layer.effect(
  CalculatorStateRef,
  Ref.make<CalculatorState>({ history: [], value: 0 }),
)

const CalculatorServiceLive = Layer.effect(
  CalculatorService,
  Effect.gen(function* () {
    const stateRef = yield* CalculatorStateRef

    return CalculatorService.of({
      add: (n) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const newValue = state.value + n
          yield* Ref.set(stateRef, {
            history: [...state.history, newValue],
            value: newValue,
          })
          return newValue
        }),

      getHistory: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          return state.history
        }),

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

      subtract: (n) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const newValue = state.value - n
          yield* Ref.set(stateRef, {
            history: [...state.history, newValue],
            value: newValue,
          })
          return newValue
        }),
    })
  }),
)

const TestLayer = CalculatorServiceLive.pipe(Layer.provideMerge(CalculatorStateLayer))

// ============================================================================
// Context Type
// ============================================================================

interface CalculatorContext {
  value: number
  history: Array<number>
}

const initialContext: CalculatorContext = {
  history: [],
  value: 0,
}

// ============================================================================
// Tests
// ============================================================================

describeFeature(
  "./packages/effect-bdd/examples/calculator.feature",
  ({ Background, Scenario, ScenarioOutline }) => {
    Background({
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("the calculator is reset", {
            handler: () =>
              Effect.gen(function* () {
                const calc = yield* CalculatorService
                yield* calc.setValue(0)
                return initialContext
              }),
          }),
        ),
    })

    Scenario("Adding two numbers", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("I have entered {int:first} into the calculator", {
            handler: (_, { first }) =>
              Effect.gen(function* () {
                const bgCtx = yield* getBackgroundContext<CalculatorContext>()
                const calc = yield* CalculatorService
                const newValue = yield* calc.add(first)
                return { ...bgCtx, value: newValue }
              }),
            params: Schema.Struct({ first: Schema.Int }),
          }),
          And("I have entered {int:second} into the calculator", {
            handler: (ctx, { second }) =>
              Effect.gen(function* () {
                const calc = yield* CalculatorService
                const newValue = yield* calc.add(second)
                return { ...ctx, value: newValue }
              }),
            params: Schema.Struct({ second: Schema.Int }),
          }),
          When("I press add", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const calc = yield* CalculatorService
                const history = yield* calc.getHistory()
                return { ...ctx, history }
              }),
          }),
          Then("the result should be {int:result}", {
            handler: (ctx, { result }) =>
              Effect.gen(function* () {
                const calc = yield* CalculatorService
                const value = yield* calc.getValue()
                expect(value).toBe(result)
                return ctx
              }),
            params: Schema.Struct({ result: Schema.Int }),
          }),
        ),
    })

    ScenarioOutline("Subtracting numbers", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("I have entered {int:first} into the calculator", {
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
          And("I have entered {int:second} into the calculator", {
            handler: (ctx, { second }) =>
              Effect.gen(function* () {
                const calc = yield* CalculatorService
                const newValue = yield* calc.subtract(second)
                return { ...ctx, value: newValue }
              }),
            params: Schema.Struct({ second: Schema.Int }),
          }),
          When("I press subtract", {
            handler: (ctx) => Effect.succeed(ctx),
          }),
          Then("the result should be {int:result}", {
            handler: (ctx, { result }) =>
              Effect.gen(function* () {
                const calc = yield* CalculatorService
                const value = yield* calc.getValue()
                expect(value).toBe(result)
                return ctx
              }),
            params: Schema.Struct({ result: Schema.Int }),
          }),
        ),
    })
  },
)
