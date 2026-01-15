import type {
	ParsedFeature,
	ParsedRule,
	ParsedScenario,
	ParsedScenarioOutline,
} from '../parser/types'

export function findScenario(
	feature: ParsedFeature,
	name: string,
	ruleName?: string,
): ParsedScenario | undefined {
	if (ruleName) {
		const rule = feature.rules.find((r) => r.name === ruleName)
		return rule?.scenarios.find((s) => s.name === name)
	}

	const featureScenario = feature.scenarios.find((s) => s.name === name)
	if (featureScenario) return featureScenario

	for (const rule of feature.rules) {
		const ruleScenario = rule.scenarios.find((s) => s.name === name)
		if (ruleScenario) return ruleScenario
	}

	return undefined
}

export function findScenarioOutline(
	feature: ParsedFeature,
	name: string,
	ruleName?: string,
): ParsedScenarioOutline | undefined {
	if (ruleName) {
		const rule = feature.rules.find((r) => r.name === ruleName)
		return rule?.scenarioOutlines.find((s) => s.name === name)
	}

	const featureOutline = feature.scenarioOutlines.find((s) => s.name === name)
	if (featureOutline) return featureOutline

	for (const rule of feature.rules) {
		const ruleOutline = rule.scenarioOutlines.find((s) => s.name === name)
		if (ruleOutline) return ruleOutline
	}

	return undefined
}

export function findRule(
	feature: ParsedFeature,
	name: string,
): ParsedRule | undefined {
	return feature.rules.find((r) => r.name === name)
}

export function listScenarios(feature: ParsedFeature): string[] {
	const featureScenarios = feature.scenarios.map((s) => s.name)
	const ruleScenarios = feature.rules.flatMap((r) =>
		r.scenarios.map((s) => `${r.name} > ${s.name}`),
	)
	return [...featureScenarios, ...ruleScenarios]
}

export function listScenarioOutlines(feature: ParsedFeature): string[] {
	const featureOutlines = feature.scenarioOutlines.map((s) => s.name)
	const ruleOutlines = feature.rules.flatMap((r) =>
		r.scenarioOutlines.map((s) => `${r.name} > ${s.name}`),
	)
	return [...featureOutlines, ...ruleOutlines]
}

export function listRules(feature: ParsedFeature): string[] {
	return feature.rules.map((r) => r.name)
}
