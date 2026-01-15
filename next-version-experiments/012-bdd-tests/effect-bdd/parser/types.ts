export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But'

export interface ParsedStep {
	keyword: StepKeyword
	text: string
	dataTable?: Record<string, string>[]
}

export interface ParsedBackground {
	steps: ParsedStep[]
}

export interface ParsedScenario {
	name: string
	description?: string
	steps: ParsedStep[]
}

export interface ParsedScenarioOutline {
	name: string
	description?: string
	steps: ParsedStep[]
	examples: Record<string, string>[]
}

export interface ParsedRule {
	name: string
	description?: string
	background?: ParsedBackground
	scenarios: ParsedScenario[]
	scenarioOutlines: ParsedScenarioOutline[]
}

export interface ParsedFeature {
	name: string
	description?: string
	background?: ParsedBackground
	scenarios: ParsedScenario[]
	scenarioOutlines: ParsedScenarioOutline[]
	rules: ParsedRule[]
}
