import { Effect, Schema } from 'effect'
import { StepParamsDecodeError } from '../errors'

type PlaceholderType = 'string' | 'int' | 'float' | 'word'

interface PlaceholderInfo {
	type: PlaceholderType
	name: string
	fullMatch: string
}

const PLACEHOLDER_REGEX = /\{(string|int|float|word):(\w+)\}/g

const PLACEHOLDER_PATTERNS: Record<PlaceholderType, string> = {
	string: '"([^"]*)"',
	int: '(-?\\d+)',
	float: '(-?\\d+\\.?\\d*)',
	word: '(\\S+)',
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractPlaceholders(pattern: string): PlaceholderInfo[] {
	const placeholders: PlaceholderInfo[] = []
	let match: RegExpExecArray | null

	const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g')
	// biome-ignore lint: -
	while ((match = regex.exec(pattern)) !== null) {
		placeholders.push({
			type: match[1] as PlaceholderType,
			name: match[2],
			fullMatch: match[0],
		})
	}

	return placeholders
}

function patternToRegex(pattern: string): { regex: RegExp; names: string[] } {
	const placeholders = extractPlaceholders(pattern)
	const names: string[] = []

	let regexStr = escapeRegex(pattern)

	for (const placeholder of placeholders) {
		const escapedPlaceholder = escapeRegex(placeholder.fullMatch)
		const replacement = PLACEHOLDER_PATTERNS[placeholder.type]
		regexStr = regexStr.replace(escapedPlaceholder, replacement)
		names.push(placeholder.name)
	}

	return { regex: new RegExp(`^${regexStr}$`), names }
}

function convertValue(value: string, type: PlaceholderType): unknown {
	switch (type) {
		case 'int':
			return parseInt(value, 10)
		case 'float':
			return parseFloat(value)
		case 'string':
		case 'word':
			return value
	}
}

export function matchPattern(
	pattern: string,
	text: string,
): Record<string, unknown> | null {
	const placeholders = extractPlaceholders(pattern)
	const { regex, names } = patternToRegex(pattern)

	const match = regex.exec(text)
	if (!match) {
		return null
	}

	const result: Record<string, unknown> = {}
	for (let i = 0; i < names.length; i++) {
		const name = names[i]
		const value = match[i + 1]
		const placeholder = placeholders[i]
		result[name] = convertValue(value, placeholder.type)
	}

	return result
}

export function decodeParams<A>(
	schema: Schema.Schema<A>,
	params: unknown,
	stepText: string,
): Effect.Effect<A, StepParamsDecodeError> {
	return Schema.decodeUnknown(schema)(params).pipe(
		Effect.tapError((error) => {
			console.log('AQUI', error.issue, params)
			return Effect.succeed('')
		}),
		Effect.mapError(
			(error) =>
				new StepParamsDecodeError({
					step: stepText,
					params,
					error,
				}),
		),
	)
}

export function extractParams(
	pattern: string,
	text: string,
	dataTable?: Record<string, string>[],
): Record<string, unknown> | null {
	const patternParams = matchPattern(pattern, text)
	if (!patternParams) {
		return null
	}

	if (dataTable && dataTable.length > 0) {
		return { ...patternParams, table: dataTable }
	}

	return patternParams
}
