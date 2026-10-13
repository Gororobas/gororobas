import { Schema } from 'effect'
import { dual } from 'effect/Function'

import { isSafeValue } from './property.ts'

// REFERENCE

const RefTypeId = '~@pleat/core/Ref'

/** Something that stands for a CSS value in a declaration: a {@link Var} or a design token.
 *  It renders as `var(--name)`, including inside template strings. */
export interface Ref {
  readonly [RefTypeId]: typeof RefTypeId
  /** The custom property name, such as `--color-ink`. */
  readonly name: string
  /** The `var()` reference, such as `var(--color-ink)`. */
  readonly reference: string
  toString(): string
}

/** Whether `value` is a {@link Ref}. */
export const isRef = (value: unknown): value is Ref =>
  typeof value === 'object' && value !== null && RefTypeId in value

/** A declaration value: a CSS string, a number (`px` unless the property is unitless), or a {@link Ref}. */
export type Value = string | number | Ref

const CUSTOM_PROPERTY_NAME = /^--[A-Za-z0-9_-]+$/

const RefProto = {
  [RefTypeId]: RefTypeId,
  toString(this: Ref): string {
    return this.reference
  },
  toJSON(this: Ref): string {
    return this.reference
  },
}

/** @internal */
export const makeRef = <Fields extends object>(
  name: string,
  fields: Fields,
  fallback?: string,
): Ref & Fields => {
  if (!CUSTOM_PROPERTY_NAME.test(name)) {
    throw new Error(
      `[pleat] ${JSON.stringify(name)} is not a custom property name. ` +
        'Use letters, digits, dashes, and underscores after "--".',
    )
  }
  if (fallback !== undefined && !isSafeValue(fallback)) {
    throw new Error(
      `[pleat] Fallback ${JSON.stringify(fallback)} for ${name} is not a safe CSS value.`,
    )
  }
  const reference = fallback === undefined ? `var(${name})` : `var(${name}, ${fallback})`
  return Object.assign(Object.create(RefProto), fields, { name, reference })
}

// VAR

/** A typed CSS custom property for values that change continuously with the Model: a
 *  progress percentage, a drag offset, a user-picked hue. Rules refer to it statically;
 *  each render binds a value with {@link bind}, which becomes one inline `--name` declaration.
 *
 *  Finite choices belong in a Recipe variant instead, where they become precompiled classes. */
export interface Var<A> extends Ref {
  /** Validates and describes the values this variable accepts. */
  readonly schema: Schema.Schema<A>
}

/** One value bound to a {@link Var} for one render. */
export interface Binding {
  readonly _tag: 'Binding'
  readonly name: string
  readonly value: string
}

/** Whether `value` is a {@link Binding}. */
export const isBinding = (value: unknown): value is Binding =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  value._tag === 'Binding'

/** Creates a custom property `--<name>` whose values are described by `schema`. The schema
 *  types what {@link bind} accepts and documents it for generated interfaces. Pass `fallback`
 *  to give the `var()` reference a default. */
export const make = <A>(
  name: string,
  schema: Schema.Schema<A>,
  options: Readonly<{ fallback?: string }> = {},
): Var<A> => makeRef(`--${name}`, { schema }, options.fallback)

/** A numeric variable, for values like `42` that rules scale with `calc()`. */
export const number = (
  name: string,
  options: Readonly<{ fallback?: string }> = {},
): Var<number> => make(name, Schema.Finite, options)

/** A string variable, for values like colors or lengths. */
export const string = (
  name: string,
  options: Readonly<{ fallback?: string }> = {},
): Var<string> => make(name, Schema.String, options)

/** Binds `value` to `variable` for one element and its descendants.
 *
 *  Throws when the value could break out of its declaration, which keeps Model data and
 *  generated content from injecting CSS. */
export const bind: {
  <A>(value: A): (variable: Var<A>) => Binding
  <A>(variable: Var<A>, value: A): Binding
} = dual(2, <A>(variable: Var<A>, value: A): Binding => {
  const encoded = String(value)
  if (!isSafeValue(encoded)) {
    throw new Error(
      `[pleat] ${JSON.stringify(encoded)} cannot be bound to ${variable.name}: ` +
        'it is empty or contains characters that could end the declaration.',
    )
  }
  return { _tag: 'Binding', name: variable.name, value: encoded }
})
