export type StepKeyword = "Given" | "When" | "Then" | "And" | "But"

export interface ParsedStep {
  keyword: StepKeyword
  text: string
  line: number
  dataTable?: Array<Record<string, string>>
}

export interface ParsedBackground {
  steps: Array<ParsedStep>
}

export interface ParsedScenario {
  name: string
  description?: string
  steps: Array<ParsedStep>
}

export interface ParsedScenarioOutline {
  name: string
  description?: string
  steps: Array<ParsedStep>
  examples: Array<Record<string, string>>
}

export interface ParsedRule {
  name: string
  description?: string
  background?: ParsedBackground
  scenarios: Array<ParsedScenario>
  scenarioOutlines: Array<ParsedScenarioOutline>
}

export interface ParsedFeature {
  name: string
  description?: string
  background?: ParsedBackground
  scenarios: Array<ParsedScenario>
  scenarioOutlines: Array<ParsedScenarioOutline>
  rules: Array<ParsedRule>
}
