import type { StepKeyword } from "../parser/types.js"

export type StepScope =
  | { type: "background" }
  | { type: "scenario"; name: string }
  | { type: "scenario_outline"; name: string }

export interface DiscoveredStep {
  pattern: string
  keyword: StepKeyword
  file: string
  line: number
  scope?: StepScope | undefined
}

export interface FeatureStep {
  text: string
  keyword: StepKeyword
  line: number
}

export interface MatchedStep {
  step: FeatureStep
  matched: boolean
  implementation?: DiscoveredStep | undefined
}

export interface ScenarioResult {
  name: string
  type: "Scenario" | "ScenarioOutline"
  steps: Array<MatchedStep>
  examplesCount?: number | undefined
}

export interface RuleResult {
  name: string
  scenarios: Array<ScenarioResult>
  backgroundSteps?: Array<MatchedStep> | undefined
}

export interface FeatureResult {
  file: string
  name: string
  scenarios: Array<ScenarioResult>
  rules: Array<RuleResult>
  backgroundSteps?: Array<MatchedStep> | undefined
}

export interface CheckResult {
  features: Array<FeatureResult>
  totalSteps: number
  undefinedSteps: number
  passed: boolean
}

export type OutputFormat = "pretty" | "json" | "github-actions"
