import { Array as Arr, Effect, Match, Option, Schema } from "effect"

import { StepParamsDecodeError } from "../errors.js"

type PlaceholderType = "string" | "int" | "float" | "word"

interface PlaceholderInfo {
  type: PlaceholderType
  name: string
  fullMatch: string
}

const PLACEHOLDER_REGEX = /\{(string|int|float|word):(\w+)\}/g

const PLACEHOLDER_PATTERNS: Record<PlaceholderType, string> = {
  float: "(-?\\d+\\.?\\d*)",
  int: "(-?\\d+)",
  string: '"([^"]*)"',
  word: "(\\S+)",
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractPlaceholders(pattern: string): Array<PlaceholderInfo> {
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g")
  return Array.from(pattern.matchAll(regex)).map((match) => ({
    fullMatch: match[0],
    name: match[2],
    type:
      match[1] === "string"
        ? "string"
        : match[1] === "int"
          ? "int"
          : match[1] === "float"
            ? "float"
            : "word",
  }))
}

function patternToRegex(pattern: string): { regex: RegExp; names: Array<string> } {
  const placeholders = extractPlaceholders(pattern)
  const names: Array<string> = []

  let regexStr = escapeRegex(pattern)

  placeholders.forEach((placeholder) => {
    const escapedPlaceholder = escapeRegex(placeholder.fullMatch)
    const replacement = PLACEHOLDER_PATTERNS[placeholder.type]
    regexStr = regexStr.replace(escapedPlaceholder, replacement)
    names.push(placeholder.name)
  })

  return { names, regex: new RegExp(`^${regexStr}$`) }
}

function convertValue(value: string, type: PlaceholderType): unknown {
  return Match.value(type).pipe(
    Match.when("int", () => parseInt(value, 10)),
    Match.when("float", () => parseFloat(value)),
    Match.when("string", () => value),
    Match.when("word", () => value),
    Match.exhaustive,
  )
}

export function matchPattern(
  pattern: string,
  text: string,
): Option.Option<Record<string, unknown>> {
  const placeholders = extractPlaceholders(pattern)
  const { names, regex } = patternToRegex(pattern)

  const match = regex.exec(text)
  if (!match) {
    return Option.none()
  }

  const result: Record<string, unknown> = {}
  names.forEach((name, index) => {
    const value = match[index + 1]
    const placeholder = placeholders[index]
    result[name] = convertValue(value, placeholder.type)
  })

  return Option.some(result)
}

export function decodeParams<A>(schema: Schema.Schema<A>, params: unknown, stepText: string) {
  return Schema.decodeUnknownEffect(schema)(params).pipe(
    Effect.mapError(
      (error) =>
        new StepParamsDecodeError({
          error,
          params,
          step: stepText,
        }),
    ),
  )
}

export function extractParams(
  pattern: string,
  text: string,
  dataTable?: Array<Record<string, string>>,
): Option.Option<Record<string, unknown>> {
  const patternParams = matchPattern(pattern, text)
  return Option.match(patternParams, {
    onNone: () => Option.none(),
    onSome: (params) =>
      Arr.isReadonlyArrayNonEmpty(dataTable ?? [])
        ? Option.some({ ...params, table: dataTable })
        : Option.some(params),
  })
}
