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
  scope?: StepScope
}

export interface FeatureStep {
  text: string
  keyword: StepKeyword
  line: number
}

export interface MatchedStep {
  step: FeatureStep
  matched: boolean
  implementation?: DiscoveredStep
}

export interface ScenarioResult {
  name: string
  type: "Scenario" | "ScenarioOutline"
  steps: Array<MatchedStep>
  examplesCount?: number
}

export interface RuleResult {
  name: string
  scenarios: Array<ScenarioResult>
  backgroundSteps?: Array<MatchedStep>
}

export interface FeatureResult {
  file: string
  name: string
  scenarios: Array<ScenarioResult>
  rules: Array<RuleResult>
  backgroundSteps?: Array<MatchedStep>
}

export interface CheckResult {
  features: Array<FeatureResult>
  totalSteps: number
  undefinedSteps: number
  passed: boolean
}

export type OutputFormat = "pretty" | "json" | "github-actions"
