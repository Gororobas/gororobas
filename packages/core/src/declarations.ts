import type * as CSS from 'csstype'

import {
  formatNumber,
  isSafeValue,
  isValidPropertyName,
  toKebabCase,
} from './property.ts'
import { type Value, isRef } from './var.ts'

/** CSS properties in camelCase, with numbers allowed wherever a length is. */
export type Properties = CSS.Properties<number | (string & {}), string & {}>

/** A declaration block: CSS properties (camelCase) and custom properties (`--name`). Values
 *  are strings, numbers (`px` unless the property is unitless), or tokens and variables. */
export type Declarations = {
  readonly [Property in keyof Properties]?:
    | Properties[Property]
    | Extract<Value, object>
    | undefined
} & {
  readonly [Property: `--${string}`]: Value | undefined
}

/** Formats one value for `property`. */
export const formatValue = (property: string, value: Value): string =>
  typeof value === 'number'
    ? formatNumber(property, value)
    : isRef(value)
      ? value.reference
      : value.trim()

/** Validates and formats a declaration block, in its insertion order. */
export const entriesOf = (
  declarations: Declarations,
): ReadonlyArray<readonly [property: string, value: string]> => {
  const entries: Array<readonly [string, string]> = []
  for (const [property, value] of Object.entries(declarations)) {
    if (value === undefined || value === null) {
      continue
    }
    if (!isValidPropertyName(property)) {
      throw new Error(
        `[pleat] ${JSON.stringify(property)} is not a CSS property name. ` +
          'Write properties in camelCase (backgroundColor) or as custom properties (--accent).',
      )
    }
    if (typeof value !== 'string' && typeof value !== 'number' && !isRef(value)) {
      throw new Error(
        `[pleat] ${property} has a ${typeof value} value. Use a string, a number, or a token.`,
      )
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`[pleat] ${property} has a non-finite value, ${value}.`)
    }
    const formatted = formatValue(property, value)
    if (!isSafeValue(formatted)) {
      throw new Error(
        `[pleat] ${property}: ${JSON.stringify(formatted)} is not a value Pleat can write ` +
          'into a rule. It is empty or unbalanced, or contains ; { } < ! or a comment ' +
          'outside a string. An unquoted url() cannot hold quotes, spaces, or parentheses; ' +
          'quote the URL instead.',
      )
    }
    entries.push([property, formatted])
  }
  return entries
}

/** `property: value` with the property in kebab-case. */
export const renderDeclaration = (property: string, value: string): string =>
  `${toKebabCase(property)}:${value}`

/** A declaration block's body, such as `color:red;padding:4px`. */
export const renderBody = (declarations: Declarations): string =>
  entriesOf(declarations)
    .map(([property, value]) => renderDeclaration(property, value))
    .join(';')
