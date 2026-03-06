import { Effect, Layer, ServiceMap } from "effect"

import { matchPattern } from "../../parser/pattern-matcher.js"
import type {
  ParsedFeature,
  ParsedRule,
  ParsedScenario,
  ParsedScenarioOutline,
  ParsedStep,
} from "../../parser/types.js"
import type {
  DiscoveredStep,
  FeatureResult,
  MatchedStep,
  RuleResult,
  ScenarioResult,
  CheckResult,
  FeatureStep,
} from "../types.js"

export class StepMatcher extends ServiceMap.Service<
  StepMatcher,
  {
    checkFeature: (
      feature: ParsedFeature,
      discoveredSteps: Array<DiscoveredStep>,
      featurePath: string,
    ) => Effect.Effect<FeatureResult>
  }
>()("StepMatcher") {}

function filterStepsByScope(
  discoveredSteps: Array<DiscoveredStep>,
  scopeType: "background" | "scenario" | "scenario_outline",
  scopeName?: string,
): Array<DiscoveredStep> {
  return discoveredSteps.filter((step) => {
    if (!step.scope) return true
    if (step.scope.type === scopeType) {
      if (scopeType === "background") return true
      return "name" in step.scope && step.scope.name === scopeName
    }
    return false
  })
}

function matchStep(
  stepText: string,
  discoveredSteps: Array<DiscoveredStep>,
): DiscoveredStep | null {
  for (const discovered of discoveredSteps) {
    const result = matchPattern(discovered.pattern, stepText)
    if (result !== null) {
      return discovered
    }
  }
  return null
}

/**
 * Normalizes a discovered pattern like `I have entered {int:first} into the calculator`
 * to `I have entered <first> into the calculator` so it can be structurally compared
 * with outline step text that uses `<placeholder>` syntax.
 */
function normalizePatternToOutlineText(pattern: string): string {
  return pattern.replace(/\{(?:string|int|float|word):(\w+)\}/g, "<$1>")
}

function matchOutlineStep(
  stepText: string,
  discoveredSteps: Array<DiscoveredStep>,
): DiscoveredStep | null {
  // First try exact/regex match (works for steps without angle-bracket placeholders)
  const exactMatch = matchStep(stepText, discoveredSteps)
  if (exactMatch) return exactMatch

  // For outline steps with <placeholder>, normalize patterns and compare structurally
  for (const discovered of discoveredSteps) {
    if (normalizePatternToOutlineText(discovered.pattern) === stepText) {
      return discovered
    }
  }
  return null
}

function matchSteps(
  steps: Array<ParsedStep>,
  discoveredSteps: Array<DiscoveredStep>,
): Array<MatchedStep> {
  return steps.map((step) => {
    const implementation = matchStep(step.text, discoveredSteps)
    const featureStep: FeatureStep = {
      keyword: step.keyword,
      line: step.line,
      text: step.text,
    }
    return {
      matched: implementation !== null,
      step: featureStep,
      implementation: implementation ?? undefined,
    }
  })
}

function checkScenario(
  scenario: ParsedScenario,
  discoveredSteps: Array<DiscoveredStep>,
): ScenarioResult {
  const scopedSteps = filterStepsByScope(discoveredSteps, "scenario", scenario.name)
  return {
    name: scenario.name,
    steps: matchSteps(scenario.steps, scopedSteps),
    type: "Scenario",
  }
}

function matchOutlineSteps(
  steps: Array<ParsedStep>,
  discoveredSteps: Array<DiscoveredStep>,
): Array<MatchedStep> {
  return steps.map((step) => {
    const implementation = matchOutlineStep(step.text, discoveredSteps)
    const featureStep: FeatureStep = {
      keyword: step.keyword,
      line: step.line,
      text: step.text,
    }
    return {
      matched: implementation !== null,
      step: featureStep,
      implementation: implementation ?? undefined,
    }
  })
}

function checkScenarioOutline(
  outline: ParsedScenarioOutline,
  discoveredSteps: Array<DiscoveredStep>,
): ScenarioResult {
  const scopedSteps = filterStepsByScope(discoveredSteps, "scenario_outline", outline.name)
  return {
    examplesCount: outline.examples.length,
    name: outline.name,
    steps: matchOutlineSteps(outline.steps, scopedSteps),
    type: "ScenarioOutline",
  }
}

function checkRule(rule: ParsedRule, discoveredSteps: Array<DiscoveredStep>): RuleResult {
  const scenarios: Array<ScenarioResult> = []

  for (const scenario of rule.scenarios) {
    scenarios.push(checkScenario(scenario, discoveredSteps))
  }

  for (const outline of rule.scenarioOutlines) {
    scenarios.push(checkScenarioOutline(outline, discoveredSteps))
  }

  const backgroundScopedSteps = filterStepsByScope(discoveredSteps, "background")
  const backgroundSteps = rule.background
    ? matchSteps(rule.background.steps, backgroundScopedSteps)
    : undefined

  return {
    backgroundSteps,
    name: rule.name,
    scenarios,
  }
}

export const StepMatcherLive = Layer.succeed(
  StepMatcher,
  StepMatcher.of({
    checkFeature: (feature, discoveredSteps, featurePath) =>
      Effect.sync(() => {
        const scenarios: Array<ScenarioResult> = []

        for (const scenario of feature.scenarios) {
          scenarios.push(checkScenario(scenario, discoveredSteps))
        }

        for (const outline of feature.scenarioOutlines) {
          scenarios.push(checkScenarioOutline(outline, discoveredSteps))
        }

        const rules: Array<RuleResult> = []
        for (const rule of feature.rules) {
          rules.push(checkRule(rule, discoveredSteps))
        }

        const backgroundScopedSteps = filterStepsByScope(discoveredSteps, "background")
        const backgroundSteps = feature.background
          ? matchSteps(feature.background.steps, backgroundScopedSteps)
          : undefined

        return {
          backgroundSteps,
          file: featurePath,
          name: feature.name,
          rules,
          scenarios,
        }
      }),
  }),
)

function countSteps(
  scenarios: Array<ScenarioResult>,
  backgroundSteps?: Array<MatchedStep>,
): { total: number; undefined: number } {
  let total = 0
  let undefined_ = 0

  if (backgroundSteps) {
    for (const step of backgroundSteps) {
      total++
      if (!step.matched) undefined_++
    }
  }

  for (const scenario of scenarios) {
    for (const step of scenario.steps) {
      total++
      if (!step.matched) undefined_++
    }
  }

  return { total, undefined: undefined_ }
}

export function aggregateResults(features: Array<FeatureResult>): CheckResult {
  let totalSteps = 0
  let undefinedSteps = 0

  for (const feature of features) {
    const featureCounts = countSteps(feature.scenarios, feature.backgroundSteps)
    totalSteps += featureCounts.total
    undefinedSteps += featureCounts.undefined

    for (const rule of feature.rules) {
      const ruleCounts = countSteps(rule.scenarios, rule.backgroundSteps)
      totalSteps += ruleCounts.total
      undefinedSteps += ruleCounts.undefined
    }
  }

  return {
    features,
    passed: undefinedSteps === 0,
    totalSteps,
    undefinedSteps,
  }
}
