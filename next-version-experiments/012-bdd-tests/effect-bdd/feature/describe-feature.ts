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
 * This ensures the layer can be used standalone without additional dependencies.
 */
type SelfContainedLayer<ROut, E = never> = Layer.Layer<ROut, E, never>

/**
 * Internal services provided by the BDD framework to all steps.
 */
type InternalServices = BackgroundContext | ScenarioContext

/**
 * Valid requirements for step effects - only services from the layer + internal services.
 */
type ValidStepRequirements<ROut> = ROut | InternalServices

// ============================================================================
// Config Interfaces with Type Safety
// ============================================================================

interface BackgroundConfig<ROut = unknown, E = unknown> {
	/**
	 * A self-contained layer that provides all services needed by the steps.
	 * Must have no external requirements (RIn = never).
	 */
	layer?: SelfContainedLayer<ROut, E>

	/**
	 * Step definitions that return an Effect.
	 * Requirements should be satisfied by the provided layer.
	 */
	steps: () => Effect.Effect<unknown, E, ValidStepRequirements<ROut>>
}

interface ScenarioConfig<ROut = unknown, E = unknown> {
	/**
	 * A self-contained layer that provides all services needed by the steps.
	 * Must have no external requirements (RIn = never).
	 */
	layer?: SelfContainedLayer<ROut, E>

	/**
	 * Step definitions that return an Effect.
	 * Requirements should be satisfied by the provided layer.
	 */
	steps: () => Effect.Effect<unknown, E, ValidStepRequirements<ROut>>
}

interface ScenarioOutlineConfig<Example, ROut = unknown, E = unknown> {
	/**
	 * A self-contained layer that provides all services needed by the steps.
	 * Must have no external requirements (RIn = never).
	 */
	layer?: SelfContainedLayer<ROut, E>

	/**
	 * Example data rows for the scenario outline.
	 */
	examples: readonly Example[]

	/**
	 * Step definitions that receive an example and return an Effect.
	 * Requirements should be satisfied by the provided layer.
	 */
	steps: (
		example: Example,
	) => Effect.Effect<unknown, E, ValidStepRequirements<ROut>>
}

// ============================================================================
// Internal Types
// ============================================================================

interface BackgroundRef {
	effect: (() => Effect.Effect<unknown, unknown, unknown>) | undefined
	parsedSteps: ParsedStep[]
	layer: SelfContainedLayer<any, any> | undefined
}

interface RuleContext {
	Background: <ROut, E>(config: BackgroundConfig<ROut, E>) => void

	Scenario: <ROut, E>(name: string, config: ScenarioConfig<ROut, E>) => void

	ScenarioOutline: <Example, ROut, E>(
		name: string,
		config: ScenarioOutlineConfig<Example, ROut, E>,
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
		effect: Effect.Effect<unknown, E, ValidStepRequirements<ROut>>
	}): Effect.Effect<unknown, unknown, unknown> {
		// Collect all layers, deduplicating by reference
		const allLayers = [
			featureBgRef.layer,
			ruleBgRef?.layer,
			scenario.layer,
		].filter((l): l is Layer.Layer<unknown, unknown, never> => l !== undefined)

		const uniqueLayers = [...new Set(allLayers)]

		// Merge all unique layers into one
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

			// 1. Run feature-level background
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

			// 2. Run rule-level background
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

			// 3. Run scenario steps
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
				ruleBgRef.layer = config.layer
			} else {
				featureBgRef.effect = config.steps
				featureBgRef.parsedSteps = parsedBackground?.steps ?? []
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

			it.effect(name, () =>
				runWithBackgrounds({
					name,
					effect: config.steps(),
					layer: config.layer,
					steps: parsedScenario.steps,
				}),
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

			describe(name, () => {
				config.examples.forEach((example, index) => {
					const label = Object.entries(example as Record<string, unknown>)
						.map(([k, v]) => `${k}=${String(v)}`)
						.join(', ')

					const substitutedSteps = parsedOutline.steps.map((step) => ({
						...step,
						text: substituteOutlinePlaceholders(
							step.text,
							example as Record<string, string>,
						),
					}))

					it.effect(`Example ${index + 1}: ${label}`, () =>
						runWithBackgrounds({
							name: `Example ${index + 1}: ${label}`,
							effect: config.steps(example),
							layer: config.layer,
							steps: config.steps(example),
						}),
					)
				})
			})
		},
	}
}

function substituteOutlinePlaceholders(
	text: string,
	example: Record<string, string>,
): string {
	let result = text
	for (const [key, value] of Object.entries(example)) {
		result = result.replace(new RegExp(`<${key}>`, 'g'), value)
	}
	return result
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
