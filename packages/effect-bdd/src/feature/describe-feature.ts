import { describe, it } from "@effect/vitest"
import {
  Array as EffectArray,
  Effect,
  Record,
  FileSystem,
  Layer,
  Option,
  Predicate,
  Path,
} from "effect"

import { BackgroundContext, ScenarioContext } from "../context.js"
import {
  FeatureParseError,
  ScenarioNotFoundError,
  ScenarioOutlineExamplesError,
} from "../errors.js"
import { parseFeatureFile } from "../parser/feature-parser.js"
import type { ParsedFeature, ParsedStep } from "../parser/types.js"
import {
  findRule,
  findScenario,
  findScenarioOutline,
  listRules,
  listScenarioOutlines,
  listScenarios,
} from "./helpers.js"

function getCallerDir(): string {
  const previousPrepareStackTrace = Error.prepareStackTrace
  let callerFile = Option.none<string>()
  Error.prepareStackTrace = (_error, stack) => {
    const fileName = stack[2]?.getFileName()
    callerFile = Option.fromNullishOr(fileName)
    return ""
  }
  const callerError = new FeatureParseError({ path: "caller", message: "Call site lookup" })
  void callerError.stack
  Error.prepareStackTrace = previousPrepareStackTrace

  if (Option.isNone(callerFile)) {
    throw new FeatureParseError({ path: "caller", message: "Could not determine caller file path" })
  }

  return callerFile.value
}

// ============================================================================
// Type-safe Layer Handling
// ============================================================================

/**
 * A self-contained layer with no external requirements.
 */
type SelfContainedLayer<ROut, E = never> = Layer.Layer<ROut, E, never>

/**
 * Internal services provided by the BDD framework to all steps.
 */
type InternalServices = BackgroundContext | ScenarioContext

// ============================================================================
// Config Interfaces with Strict Type Safety
// ============================================================================

/**
 * Background config WITH a layer - steps can use services from the layer
 */
interface BackgroundConfigWithLayer<ROut, E> {
  layer: SelfContainedLayer<ROut, E>
  steps: () => Effect.Effect<unknown, E, ROut | InternalServices>
}

/**
 * Background config WITHOUT a layer - steps can only use internal services
 */
interface BackgroundConfigWithoutLayer<E> {
  layer?: never
  steps: () => Effect.Effect<unknown, E, InternalServices>
}

/**
 * Union type that enforces: if no layer, steps must have no external requirements
 */
type BackgroundConfig<ROut = never, E = never> =
  | BackgroundConfigWithLayer<ROut, E>
  | BackgroundConfigWithoutLayer<E>

/**
 * Scenario config WITH a layer - steps can use services from the layer
 */
interface ScenarioConfigWithLayer<ROut, E> {
  layer: SelfContainedLayer<ROut, E>
  steps: () => Effect.Effect<unknown, E, ROut | InternalServices>
}

/**
 * Scenario config WITHOUT a layer - steps can only use internal services
 */
interface ScenarioConfigWithoutLayer<E> {
  layer?: never
  steps: () => Effect.Effect<unknown, E, InternalServices>
}

/**
 * Union type that enforces: if no layer, steps must have no external requirements
 */
type ScenarioConfig<ROut = never, E = never> =
  | ScenarioConfigWithLayer<ROut, E>
  | ScenarioConfigWithoutLayer<E>

/**
 * ScenarioOutline config WITH a layer
 */
interface ScenarioOutlineConfigWithLayer<ROut, E> {
  layer: SelfContainedLayer<ROut, E>
  steps: () => Effect.Effect<unknown, E, ROut | InternalServices>
}

/**
 * ScenarioOutline config WITHOUT a layer
 */
interface ScenarioOutlineConfigWithoutLayer<E> {
  layer?: never
  steps: () => Effect.Effect<unknown, E, InternalServices>
}

/**
 * Union type that enforces: if no layer, steps must have no external requirements
 */
type ScenarioOutlineConfig<ROut = never, E = never> =
  | ScenarioOutlineConfigWithLayer<ROut, E>
  | ScenarioOutlineConfigWithoutLayer<E>

// ============================================================================
// Internal Types
// ============================================================================

interface BackgroundRef {
  effect: Option.Option<() => Effect.Effect<unknown, unknown, unknown>>
  parsedSteps: Array<ParsedStep>
  layer: Option.Option<SelfContainedLayer<unknown, unknown>>
}

interface RuleContext {
  /**
   * Define background steps that run before each scenario.
   *
   * @example
   * // With a layer (steps can use services from the layer)
   * Background({
   *   layer: TestLayer,
   *   steps: () => runSteps(Given('setup', { handler: () => Effect.gen(function* () {
   *     const service = yield* MyService // OK - provided by TestLayer
   *   })}))
   * })
   *
   * @example
   * // Without a layer (steps cannot use external services)
   * Background({
   *   steps: () => runSteps(Given('setup', { handler: () => Effect.succeed({ ready: true }) }))
   * })
   */
  Background: <ROut, E>(config: BackgroundConfig<ROut, E>) => void

  /**
   * Define a scenario test.
   */
  Scenario: <ROut, E>(name: string, config: ScenarioConfig<ROut, E>) => void

  /**
   * Define a scenario outline with examples from the feature file.
   */
  ScenarioOutline: <ROut, E>(name: string, config: ScenarioOutlineConfig<ROut, E>) => void
}

interface FeatureContext extends RuleContext {
  Rule: (name: string, callback: (ctx: RuleContext) => void) => void
}

// ============================================================================
// Helper Functions
// ============================================================================

function provideLayer<T, E, R, LO, LE>(
  effect: Effect.Effect<T, E, R>,
  layer?:
    | Layer.Layer<unknown, unknown, never>
    | Layer.Layer<LO, LE, never>
    | Layer.Layer<never, unknown, unknown>,
) {
  if (layer === undefined) {
    return effect
  }
  return effect.pipe(Effect.provide(layer))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Predicate.isObject(value)
}

function createRunWithBackgrounds({
  featureBgRef,
  ruleBgRef,
}: {
  featureBgRef: BackgroundRef
  ruleBgRef?: BackgroundRef
}) {
  return function runWithBackgrounds<ROut, E>(scenario: {
    name: string
    steps: Array<ParsedStep>
    layer?: SelfContainedLayer<ROut, E>
    effect: Effect.Effect<unknown, E, ROut | InternalServices>
  }): Effect.Effect<unknown, unknown, unknown> {
    const allLayers = [
      ...EffectArray.fromOption(featureBgRef.layer),
      ...(ruleBgRef ? EffectArray.fromOption(ruleBgRef.layer) : []),
      ...(scenario.layer ? [scenario.layer] : []),
    ]

    const uniqueLayers = EffectArray.dedupe(allLayers)

    const combinedLayer = EffectArray.match(uniqueLayers, {
      onEmpty: () => undefined,
      onNonEmpty: (layers) =>
        layers.length === 1
          ? layers[0]
          : layers.length === 2
            ? Layer.merge(layers[0], layers[1])
            : Layer.merge(Layer.merge(layers[0], layers[1]), layers[2]),
    })

    const execution = Effect.gen(function* () {
      let ctx: Record<string, unknown> = {}

      if (Option.isSome(featureBgRef.effect)) {
        const featureResult = yield* featureBgRef.effect.value().pipe(
          Effect.provideService(BackgroundContext, {}),
          Effect.provideService(ScenarioContext, {
            name: "Background",
            steps: featureBgRef.parsedSteps,
          }),
        )
        ctx = isRecord(featureResult) ? featureResult : {}
      }

      if (ruleBgRef && Option.isSome(ruleBgRef.effect)) {
        const ruleResult = yield* ruleBgRef.effect.value().pipe(
          Effect.provideService(BackgroundContext, ctx),
          Effect.provideService(ScenarioContext, {
            name: "Rule/Background",
            steps: ruleBgRef.parsedSteps,
          }),
        )
        ctx = { ...ctx, ...(isRecord(ruleResult) ? ruleResult : {}) }
      }

      yield* scenario.effect.pipe(
        Effect.provideService(BackgroundContext, ctx),
        Effect.provideService(ScenarioContext, {
          name: scenario.name,
          steps: scenario.steps,
        }),
      )
    })

    return provideLayer(execution, combinedLayer)
  }
}

function substituteOutlinePlaceholders(text: string, example: Record<string, string>): string {
  return Record.toEntries(example).reduce(
    (result, [key, value]) => result.replace(new RegExp(`<${key}>`, "g"), String(value)),
    text,
  )
}

function createRuleContext(
  feature: ParsedFeature,
  featurePath: string,
  featureBgRef: BackgroundRef,
  ruleBgRef?: BackgroundRef,
  ruleName?: string,
): RuleContext {
  const runWithBackgrounds = createRunWithBackgrounds({
    featureBgRef,
    ...(ruleBgRef ? { ruleBgRef } : {}),
  })

  return {
    Background: (config) => {
      const parsedBackground = ruleName
        ? Option.getOrElse(findRule(feature, ruleName), () => ({ background: undefined }))
            .background
        : feature.background

      if (ruleBgRef) {
        ruleBgRef.effect = Option.some(config.steps)
        ruleBgRef.parsedSteps = parsedBackground?.steps ?? []
        // @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
        ruleBgRef.layer = Option.fromNullishOr(config.layer)
      } else {
        featureBgRef.effect = Option.some(config.steps)
        featureBgRef.parsedSteps = parsedBackground?.steps ?? []
        // @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
        featureBgRef.layer = Option.fromNullishOr(config.layer)
      }
    },

    Scenario: (name, config) => {
      const parsedScenario = Option.getOrElse(findScenario(feature, name, ruleName), () => {
        throw new ScenarioNotFoundError({
          availableScenarios: listScenarios(feature),
          feature: featurePath,
          scenario: name,
        })
      })

      it.effect(
        name,
        // @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
        () => {
          return runWithBackgrounds({
            effect: config.steps(),
            ...(config.layer ? { layer: config.layer } : {}),
            name,
            steps: parsedScenario.steps,
          })
        },
      )
    },

    ScenarioOutline: (name, config) => {
      const parsedOutline = Option.getOrElse(findScenarioOutline(feature, name, ruleName), () => {
        throw new ScenarioNotFoundError({
          availableScenarios: listScenarioOutlines(feature),
          feature: featurePath,
          scenario: name,
        })
      })

      if (EffectArray.isReadonlyArrayEmpty(parsedOutline.examples)) {
        throw new ScenarioOutlineExamplesError({ feature: featurePath, scenario: name })
      }

      describe(name, () => {
        parsedOutline.examples.forEach((example, index) => {
          const label = Record.toEntries(example)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(", ")

          const substitutedSteps = parsedOutline.steps.map((step) => ({
            ...step,
            text: substituteOutlinePlaceholders(step.text, example),
          }))

          it.effect(
            `Example ${index + 1}: ${label}`,
            // @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
            () => {
              return runWithBackgrounds({
                effect: config.steps(),
                ...(config.layer ? { layer: config.layer } : {}),
                name: `${name} - Example ${index + 1}`,
                steps: substitutedSteps,
              })
            },
          )
        })
      })
    },
  }
}

function missingRule(name: string, feature: string, availableRules: Array<string>): never {
  throw new ScenarioNotFoundError({
    availableScenarios: availableRules,
    feature,
    scenario: name,
  })
}

// ============================================================================
// Main Export
// ============================================================================

export function describeFeature(
  featurePath: string,
  callback: (ctx: FeatureContext) => void,
): Effect.Effect<void, FeatureParseError, FileSystem.FileSystem> {
  // Capture the call site before the Effect program runs; executing this lookup
  // inside Effect.gen would return an Effect runtime frame instead of the test file.
  const callerFile = getCallerDir()

  // oxlint-disable-next-line effect/casting-awareness the BDD callback intentionally hides its internal requirements.
  return Effect.gen(function* () {
    const path = yield* Path.Path
    const absolute = path.isAbsolute(featurePath)
    const featureBasePath = absolute ? path.resolve(".") : path.dirname(callerFile)
    const absoluteFeaturePath = absolute ? featurePath : path.join(featureBasePath, featurePath)
    const feature = yield* parseFeatureFile(featurePath, featureBasePath)

    yield* Effect.sync(() => {
      describe(feature.name, () => {
        const featureBgRef: BackgroundRef = {
          effect: Option.none(),
          layer: Option.none(),
          parsedSteps: [],
        }

        const featureCtx: FeatureContext = {
          ...createRuleContext(feature, absoluteFeaturePath, featureBgRef),

          Rule: (name, ruleCallback) => {
            Option.match(findRule(feature, name), {
              onNone: () => missingRule(name, absoluteFeaturePath, listRules(feature)),
              onSome: () => undefined,
            })

            describe(name, () => {
              const ruleBgRef: BackgroundRef = {
                effect: Option.none(),
                layer: Option.none(),
                parsedSteps: [],
              }
              ruleCallback(
                createRuleContext(feature, absoluteFeaturePath, featureBgRef, ruleBgRef, name),
              )
            })
          },
        }

        callback(featureCtx)
      })
    })
  }).pipe(
    Effect.provide(Path.layer),
    Effect.mapError((error) =>
      error instanceof FeatureParseError
        ? error
        : new FeatureParseError({ message: String(error), path: featurePath }),
    ),
  ) as Effect.Effect<void, FeatureParseError, FileSystem.FileSystem>
}
