import { Data, type ParseResult } from 'effect'

export class FeatureParseError extends Data.TaggedError('FeatureParseError')<{
	path: string
	message: string
}> {}

export class StepMatchError extends Data.TaggedError('StepMatchError')<{
	pattern: string
	text: string
	feature: string
}> {}

export class StepParamsDecodeError extends Data.TaggedError(
	'StepParamsDecodeError',
)<{
	step: string
	params: unknown
	error: ParseResult.ParseError
}> {}

export class ScenarioNotFoundError extends Data.TaggedError(
	'ScenarioNotFoundError',
)<{
	scenario: string
	feature: string
	availableScenarios: string[]
}> {}

export class PatternMismatchError extends Data.TaggedError(
	'PatternMismatchError',
)<{
	pattern: string
	featureText: string
	suggestion?: string
}> {}

export class StepCountMismatchError extends Data.TaggedError(
	'StepCountMismatchError',
)<{
	feature: string
	scenario: string
	expectedCount: number
	actualCount: number
	featureSteps: string[]
	providedPatterns: string[]
}> {
	get message() {
		return [
			`Step count mismatch in "${this.scenario}"`,
			``,
			`Feature file has ${this.expectedCount} steps:`,
			...this.featureSteps.map((s, i) => `  ${i + 1}. ${s}`),
			``,
			`But you provided ${this.actualCount} step handlers:`,
			...this.providedPatterns.map((p, i) => `  ${i + 1}. ${p}`),
			``,
			this.expectedCount > this.actualCount
				? `Missing ${this.expectedCount - this.actualCount} handler(s) for steps ${this.actualCount + 1}-${this.expectedCount}`
				: `${this.actualCount - this.expectedCount} extra handler(s) provided`,
		].join('\n')
	}
}

export class StepValidationError extends Data.TaggedError(
	'StepValidationError',
)<{
	scenario: string
	mismatches: Array<{
		index: number
		featureStep: string
		providedPattern: string
		reason: string
	}>
	featureSteps: string[]
	providedPatterns: string[]
}> {
	get message() {
		const mismatchDetails = this.mismatches
			.map(
				(m) =>
					`  Step ${m.index + 1}:\n` +
					`    Feature:  "${m.featureStep}"\n` +
					`    Handler:  "${m.providedPattern}"\n` +
					`    Problem:  ${m.reason}`,
			)
			.join('\n\n')

		return [
			`Step validation failed in "${this.scenario}"`,
			``,
			`Mismatches found:`,
			mismatchDetails,
			``,
			`All feature steps:`,
			...this.featureSteps.map((s, i) => `  ${i + 1}. ${s}`),
			``,
			`All provided handlers:`,
			...this.providedPatterns.map((p, i) => `  ${i + 1}. ${p}`),
		].join('\n')
	}
}
