import { Option } from "effect"

import type {
  ParsedFeature,
  ParsedRule,
  ParsedScenario,
  ParsedScenarioOutline,
} from "../parser/types.js"

export function findScenario(
  feature: ParsedFeature,
  name: string,
  ruleName?: string,
): Option.Option<ParsedScenario> {
  if (ruleName) {
    const rule = feature.rules.find((r) => r.name === ruleName)
    return Option.fromNullishOr(rule?.scenarios.find((s) => s.name === name))
  }

  const featureScenario = feature.scenarios.find((s) => s.name === name)
  if (featureScenario) return Option.some(featureScenario)

  return Option.fromNullishOr(
    feature.rules.flatMap((rule) => rule.scenarios).find((scenario) => scenario.name === name),
  )
}

export function findScenarioOutline(
  feature: ParsedFeature,
  name: string,
  ruleName?: string,
): Option.Option<ParsedScenarioOutline> {
  if (ruleName) {
    const rule = feature.rules.find((r) => r.name === ruleName)
    return Option.fromNullishOr(rule?.scenarioOutlines.find((s) => s.name === name))
  }

  const featureOutline = feature.scenarioOutlines.find((s) => s.name === name)
  if (featureOutline) return Option.some(featureOutline)

  return Option.fromNullishOr(
    feature.rules.flatMap((rule) => rule.scenarioOutlines).find((outline) => outline.name === name),
  )
}

export function findRule(feature: ParsedFeature, name: string): Option.Option<ParsedRule> {
  return Option.fromNullishOr(feature.rules.find((r) => r.name === name))
}

export function listScenarios(feature: ParsedFeature): Array<string> {
  const featureScenarios = feature.scenarios.map((s) => s.name)
  const ruleScenarios = feature.rules.flatMap((r) =>
    r.scenarios.map((s) => `${r.name} > ${s.name}`),
  )
  return [...featureScenarios, ...ruleScenarios]
}

export function listScenarioOutlines(feature: ParsedFeature): Array<string> {
  const featureOutlines = feature.scenarioOutlines.map((s) => s.name)
  const ruleOutlines = feature.rules.flatMap((r) =>
    r.scenarioOutlines.map((s) => `${r.name} > ${s.name}`),
  )
  return [...featureOutlines, ...ruleOutlines]
}

export function listRules(feature: ParsedFeature): Array<string> {
  return feature.rules.map((r) => r.name)
}
