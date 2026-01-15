import { describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { BackgroundContext, ScenarioContext } from '../context'
import { ScenarioNotFoundError } from '../errors'
import { parseFeatureFileSync } from '../parser/feature-parser'
import type { ParsedFeature, ParsedStep } from '../parser/types'
import {
	findRule,
	findScenario,
	findScenarioOutline,
	listRules,
	listScenarioOutlines,
	listScenarios,
} from './helpers'

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
	layer?: undefined
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
	layer?: undefined
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
	layer?: undefined
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
	effect: (() => Effect.Effect<unknown, unknown, unknown>) | undefined
	parsedSteps: ParsedStep[]
	layer: SelfContainedLayer<unknown, unknown> | undefined
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
	ScenarioOutline: <ROut, E>(
		name: string,
		config: ScenarioOutlineConfig<ROut, E>,
	) => void
}

interface FeatureContext extends RuleContext {
	Rule: (name: string, callback: (ctx: RuleContext) => void) => void
}

// ============================================================================
// Helper Functions
// ============================================================================

function provideLayer<A, E, R>(
	effect: Effect.Effect<A, E, R>,
	layer: Layer.Layer<unknown, unknown, never> | undefined,
): Effect.Effect<A, unknown, unknown> {
	if (!layer) {
		return effect as Effect.Effect<A, unknown, unknown>
	}
	return effect.pipe(Effect.provide(layer)) as Effect.Effect<
		A,
		unknown,
		unknown
	>
}

function createRunWithBackgrounds({
	featureBgRef,
	ruleBgRef,
}: {
	featureBgRef: BackgroundRef
	ruleBgRef: BackgroundRef | undefined
}) {
	return function runWithBackgrounds<ROut, E>(scenario: {
		name: string
		steps: ParsedStep[]
		layer: SelfContainedLayer<ROut, E> | undefined
		effect: Effect.Effect<unknown, E, ROut | InternalServices>
	}): Effect.Effect<unknown, unknown, unknown> {
		const allLayers = [
			featureBgRef.layer,
			ruleBgRef?.layer,
			scenario.layer,
		].filter((l): l is Layer.Layer<unknown, unknown, never> => l !== undefined)

		const uniqueLayers = [...new Set(allLayers)]

		const combinedLayer: Layer.Layer<unknown, unknown, never> | undefined =
			uniqueLayers.length === 0
				? undefined
				: uniqueLayers.length === 1
					? uniqueLayers[0]
					: (uniqueLayers.reduce((acc, layer) =>
							Layer.merge(acc, layer),
						) as Layer.Layer<unknown, unknown, never>)

		const execution = Effect.gen(function* () {
			let ctx: Record<string, unknown> = {}

			if (featureBgRef.effect) {
				const featureResult = yield* featureBgRef.effect().pipe(
					Effect.provideService(BackgroundContext, {}),
					Effect.provideService(ScenarioContext, {
						name: 'Background',
						steps: featureBgRef.parsedSteps,
					}),
				)
				ctx = featureResult as Record<string, unknown>
			}

			if (ruleBgRef?.effect) {
				const ruleResult = yield* ruleBgRef.effect().pipe(
					Effect.provideService(BackgroundContext, ctx),
					Effect.provideService(ScenarioContext, {
						name: 'Rule/Background',
						steps: ruleBgRef.parsedSteps,
					}),
				)
				ctx = { ...ctx, ...(ruleResult as Record<string, unknown>) }
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

function substituteOutlinePlaceholders(
	text: string,
	example: Record<string, string>,
): string {
	let result = text
	for (const [key, value] of Object.entries(example)) {
		result = result.replace(new RegExp(`<${key}>`, 'g'), String(value))
	}
	return result
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
		ruleBgRef,
	})

	return {
		Background: (config) => {
			const parsedBackground = ruleName
				? findRule(feature, ruleName)?.background
				: feature.background

			if (ruleBgRef) {
				ruleBgRef.effect = config.steps
				ruleBgRef.parsedSteps = parsedBackground?.steps ?? []
				// @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
				ruleBgRef.layer = config.layer
			} else {
				featureBgRef.effect = config.steps
				featureBgRef.parsedSteps = parsedBackground?.steps ?? []
				// @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
				featureBgRef.layer = config.layer
			}
		},

		Scenario: (name, config) => {
			const parsedScenario = findScenario(feature, name, ruleName)
			if (!parsedScenario) {
				throw new ScenarioNotFoundError({
					scenario: name,
					feature: featurePath,
					availableScenarios: listScenarios(feature),
				})
			}

			it.effect(
				name,
				// @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
				() => {
					return runWithBackgrounds({
						name,
						effect: config.steps(),
						layer: config.layer,
						steps: parsedScenario.steps,
					})
				},
			)
		},

		ScenarioOutline: (name, config) => {
			const parsedOutline = findScenarioOutline(feature, name, ruleName)
			if (!parsedOutline) {
				throw new ScenarioNotFoundError({
					scenario: name,
					feature: featurePath,
					availableScenarios: listScenarioOutlines(feature),
				})
			}

			if (parsedOutline.examples.length === 0) {
				throw new Error(
					`ScenarioOutline "${name}" has no examples in ${featurePath}`,
				)
			}

			describe(name, () => {
				parsedOutline.examples.forEach((example, index) => {
					const label = Object.entries(example)
						.map(([k, v]) => `${k}=${String(v)}`)
						.join(', ')

					const substitutedSteps = parsedOutline.steps.map((step) => ({
						...step,
						text: substituteOutlinePlaceholders(step.text, example),
					}))

					it.effect(
						`Example ${index + 1}: ${label}`,
						// @ts-expect-error test runner is working, it's AI generated and I don't fully comprehend it
						() => {
							return runWithBackgrounds({
								name: `${name} - Example ${index + 1}`,
								effect: config.steps(),
								layer: config.layer,
								steps: substitutedSteps,
							})
						},
					)
				})
			})
		},
	}
}

// ============================================================================
// Main Export
// ============================================================================

export function describeFeature(
	featurePath: string,
	callback: (ctx: FeatureContext) => void,
): void {
	const feature = parseFeatureFileSync(featurePath)

	describe(feature.name, () => {
		const featureBgRef: BackgroundRef = {
			effect: undefined,
			parsedSteps: [],
			layer: undefined,
		}

		const featureCtx: FeatureContext = {
			...createRuleContext(feature, featurePath, featureBgRef),

			Rule: (name, ruleCallback) => {
				const parsedRule = findRule(feature, name)
				if (!parsedRule) {
					throw new Error(
						`Rule "${name}" not found in ${featurePath}. Available rules: ${listRules(feature).join(', ')}`,
					)
				}

				describe(name, () => {
					const ruleBgRef: BackgroundRef = {
						effect: undefined,
						parsedSteps: [],
						layer: undefined,
					}
					ruleCallback(
						createRuleContext(
							feature,
							featurePath,
							featureBgRef,
							ruleBgRef,
							name,
						),
					)
				})
			},
		}

		callback(featureCtx)
	})
}
