import { Context, Effect, Layer, Option } from "effect"

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

export class StepMatcher extends Context.Service<
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
): Option.Option<DiscoveredStep> {
  return Option.fromNullishOr(
    discoveredSteps.find((discovered) => Option.isSome(matchPattern(discovered.pattern, stepText))),
  )
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
): Option.Option<DiscoveredStep> {
  // First try exact/regex match (works for steps without angle-bracket placeholders)
  const exactMatch = matchStep(stepText, discoveredSteps)
  if (Option.isSome(exactMatch)) return exactMatch

  // For outline steps with <placeholder>, normalize patterns and compare structurally
  return Option.fromNullishOr(
    discoveredSteps.find(
      (discovered) => normalizePatternToOutlineText(discovered.pattern) === stepText,
    ),
  )
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
      matched: Option.isSome(implementation),
      step: featureStep,
      ...(Option.isSome(implementation) ? { implementation: implementation.value } : {}),
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
      matched: Option.isSome(implementation),
      step: featureStep,
      ...(Option.isSome(implementation) ? { implementation: implementation.value } : {}),
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
  const scenarios = [
    ...rule.scenarios.map((scenario) => checkScenario(scenario, discoveredSteps)),
    ...rule.scenarioOutlines.map((outline) => checkScenarioOutline(outline, discoveredSteps)),
  ]

  const backgroundScopedSteps = filterStepsByScope(discoveredSteps, "background")
  const backgroundSteps = rule.background
    ? matchSteps(rule.background.steps, backgroundScopedSteps)
    : undefined

  return {
    ...(backgroundSteps ? { backgroundSteps } : {}),
    name: rule.name,
    scenarios,
  }
}

export const StepMatcherLive = Layer.succeed(
  StepMatcher,
  StepMatcher.of({
    checkFeature: (feature, discoveredSteps, featurePath) =>
      Effect.sync(() => {
        const scenarios = [
          ...feature.scenarios.map((scenario) => checkScenario(scenario, discoveredSteps)),
          ...feature.scenarioOutlines.map((outline) =>
            checkScenarioOutline(outline, discoveredSteps),
          ),
        ]
        const rules = feature.rules.map((rule) => checkRule(rule, discoveredSteps))

        const backgroundScopedSteps = filterStepsByScope(discoveredSteps, "background")
        const backgroundSteps = feature.background
          ? matchSteps(feature.background.steps, backgroundScopedSteps)
          : undefined

        return {
          ...(backgroundSteps ? { backgroundSteps } : {}),
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
  const steps = [...(backgroundSteps ?? []), ...scenarios.flatMap((scenario) => scenario.steps)]
  return {
    total: steps.length,
    undefined: steps.filter((step) => !step.matched).length,
  }
}

export function aggregateResults(features: Array<FeatureResult>): CheckResult {
  const counts = features.flatMap((feature) => [
    countSteps(feature.scenarios, feature.backgroundSteps),
    ...feature.rules.map((rule) => countSteps(rule.scenarios, rule.backgroundSteps)),
  ])
  const totalSteps = counts.reduce((total, count) => total + count.total, 0)
  const undefinedSteps = counts.reduce((total, count) => total + count.undefined, 0)

  return {
    features,
    passed: undefinedSteps === 0,
    totalSteps,
    undefinedSteps,
  }
}
