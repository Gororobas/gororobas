import { Effect, Option, Schema } from 'effect'

import { formatNumber } from './property.ts'
import {
  type Kind,
  type Spec,
  type Token,
  type Tokens,
  isToken,
  leaves,
} from './token.ts'
import { type Binding, type Ref, type Var, isRef } from './var.ts'

// TYPES

/** What a theme can give a token of kind `N` that holds `A`: a value, a {@link Var.Var}, or
 *  another token of the same kind, which aliases it. A token of the `Value` kind can alias a
 *  token of any kind. */
export type Value<A extends string | number, N extends string> =
  | A
  | Var<A>
  | (string extends N ? Token : N extends 'Value' ? Token : Token<A, N>)

/** Values for every token in a tree. A value may be another token, to alias it. */
export type Values<T> =
  T extends Token<infer A, infer N>
    ? Value<A, N>
    : { readonly [K in keyof T]: Values<T[K]> }

/** Values for some tokens in a tree, for overriding part of a theme. */
export type PartialValues<T> =
  T extends Token<infer A, infer N>
    ? Value<A, N>
    : { readonly [K in keyof T]?: PartialValues<T[K]> }

/** Literal values for every token in a tree, with no aliases: what {@link schema} decodes
 *  from JSON. */
export type LiteralValues<T> =
  T extends Token<infer A, string> ? A : { readonly [K in keyof T]: LiteralValues<T[K]> }

/** Literal values for some tokens in a tree: what {@link partialSchema} decodes. */
export type PartialLiteralValues<T> =
  T extends Token<infer A, string>
    ? A
    : { readonly [K in keyof T]?: PartialLiteralValues<T[K]> }

/** An assignment of values to tokens. Applying a theme to a selector sets its custom
 *  properties there, and every style that uses the tokens follows. Themes nest by selector.
 *
 *  An alias is a `var()` reference, and CSS resolves it where the theme is applied, before
 *  descendants inherit the result. So a theme at `:root` that sets `--accent:
 *  var(--blue-500)` gives every descendant the root's blue, even one where `--blue-500` is
 *  set again: re-pointing a primitive doesn't move the semantic tokens built on it. To
 *  retarget them in a scope, apply a {@link patch} there, which declares the aliases that
 *  depend on what it overrides, or a whole theme from {@link extend}, which declares every
 *  token again. {@link resolve} computes what a token ends up as in nested scopes. */
export interface Theme {
  readonly _tag: 'Theme'
  /** Custom property declarations, in token order. */
  readonly declarations: ReadonlyArray<readonly [name: string, value: string]>
  /** Every token of the trees the theme was made from, by custom property name, whether
   *  the theme sets it or not. */
  readonly tokens: ReadonlyMap<string, Token>
}

// SCHEMA

const schemaFor = (tokens: object, isPartial: boolean): Schema.Top => {
  if (isToken(tokens)) {
    return tokens.kind.schema
  }
  const fields: Record<string, Schema.Top> = {}
  for (const [key, child] of Object.entries(tokens)) {
    if (typeof child === 'object' && child !== null) {
      const field = schemaFor(child, isPartial)
      fields[key] = isPartial ? Schema.optionalKey(field) : field
    }
  }
  return Schema.Struct(fields)
}

/** The Schema for a complete set of theme values. Each leaf validates its token's kind, so a
 *  theme a language model writes is checked before any of it becomes CSS. It decodes literal
 *  values only: an alias is a token, which JSON can't hold. */
export const schema = <T extends object>(
  tokens: T,
): Schema.Codec<LiteralValues<T>, unknown> =>
  // NOTE: the Struct is built by walking the token tree, which mirrors LiteralValues<T>.
  schemaFor(tokens, false) as unknown as Schema.Codec<LiteralValues<T>, unknown>

/** The Schema for values that override some tokens in a tree, such as the brand colors a
 *  customer may set. Every key is optional; each value present is checked like
 *  {@link schema} checks it. */
export const partialSchema = <T extends object>(
  tokens: T,
): Schema.Codec<PartialLiteralValues<T>, unknown> =>
  // NOTE: the Struct is built by walking the token tree, which mirrors PartialLiteralValues<T>.
  schemaFor(tokens, true) as unknown as Schema.Codec<PartialLiteralValues<T>, unknown>

// TOKENS

const tokensOf = (tokens: object): ReadonlyMap<string, Token> =>
  new Map(leaves(tokens).map(token => [token.name, token]))

// NOTE: tokens are compared by identity, so two trees that happen to share a
// path (two `space.2`s from separate `Token.make` calls) still collide.
const unionTokens = (
  left: ReadonlyMap<string, Token>,
  right: ReadonlyMap<string, Token>,
): ReadonlyMap<string, Token> => {
  const union = new Map(left)
  for (const [name, token] of right) {
    const existing = union.get(name)
    if (existing !== undefined && existing !== token) {
      throw new Error(
        `[pleat] Two token trees both name ${name} (${existing.path.join('.')} and ` +
          `${token.path.join('.')}). Give one tree a prefix with Token.make(spec, { prefix }).`,
      )
    }
    union.set(name, token)
  }
  return union
}

// CONSTRUCTORS

/** The theme that sets nothing. The identity of {@link merge}. */
export const empty: Theme = { _tag: 'Theme', declarations: [], tokens: new Map() }

const encode = (token: Token, value: unknown): string =>
  isRef(value)
    ? value.reference
    : typeof value === 'number'
      ? token.kind.name === 'Number'
        ? String(value)
        : formatNumber('width', value)
      : String(value)

// NOTE: a `Value` token holds any CSS value, so it can alias a token of any kind.
const canAlias = (token: Token, target: Token): boolean =>
  token.kind.name === 'Value' || token.kind.name === target.kind.name

const collect = (
  tokens: object,
  values: unknown,
  path: ReadonlyArray<string>,
  declarations: Array<readonly [string, string]>,
  isComplete: boolean,
  isDecoded: boolean,
): void => {
  if (values === undefined) {
    if (isComplete) {
      throw new Error(
        `[pleat] Theme.make has no value for ${path.join('.') || 'the root'}. Give every ` +
          'token a value, or use Theme.extend to set some of them.',
      )
    }
    return
  }
  if (isToken(tokens)) {
    if (isToken(values) && !canAlias(tokens, values)) {
      throw new Error(
        `[pleat] Theme value for ${path.join('.')} aliases ${values.path.join('.')}, which ` +
          `holds a ${values.kind.name}, not a ${tokens.kind.name}.`,
      )
    }
    if (!isDecoded && !isRef(values)) {
      const result = Schema.decodeUnknownExit(tokens.kind.schema)(values)
      if (result._tag === 'Failure') {
        throw new Error(
          `[pleat] Theme value ${JSON.stringify(values)} for ${path.join('.')} is not a valid ${tokens.kind.name}.`,
        )
      }
    }
    declarations.push([tokens.name, encode(tokens, values)])
    return
  }
  if (typeof values !== 'object' || values === null) {
    throw new Error(
      `[pleat] Theme values at ${path.join('.') || 'the root'} must be an object.`,
    )
  }
  for (const [key, child] of Object.entries(tokens)) {
    if (typeof child === 'object' && child !== null) {
      collect(
        child,
        Reflect.get(values, key),
        [...path, key],
        declarations,
        isComplete,
        isDecoded,
      )
    }
  }
}

const REFERENCE = /var\(\s*(--[A-Za-z0-9_-]+)/g

// NOTE: CSS makes every custom property on a reference cycle invalid, so a
// cycle among one theme's declarations is always a mistake. References to
// properties the theme doesn't set resolve from enclosing scopes.
const checkCycles = (declarations: ReadonlyArray<readonly [string, string]>): void => {
  const values = new Map(declarations)
  const visited = new Map<string, 'Visiting' | 'Done'>()
  const visit = (name: string, trail: ReadonlyArray<string>): void => {
    const state = visited.get(name)
    if (state === 'Done') {
      return
    }
    if (state === 'Visiting') {
      const cycle = [...trail.slice(trail.indexOf(name)), name]
      throw new Error(
        `[pleat] Theme aliases form a cycle: ${cycle.join(' → ')}. CSS makes every ` +
          'property on a cycle invalid.',
      )
    }
    visited.set(name, 'Visiting')
    for (const [, target] of (values.get(name) ?? '').matchAll(REFERENCE)) {
      if (target !== undefined && values.has(target)) {
        visit(target, [...trail, name])
      }
    }
    visited.set(name, 'Done')
  }
  for (const [name] of declarations) {
    visit(name, [])
  }
}

const makeTheme = (
  declarations: ReadonlyArray<readonly [string, string]>,
  tokens: ReadonlyMap<string, Token>,
): Theme => {
  checkCycles(declarations)
  return { _tag: 'Theme', declarations, tokens }
}

/** A theme that gives every token in `tokens` a value. Throws when a value is missing or
 *  doesn't match its token's kind, when an alias points at a token of another kind, or when
 *  aliases form a cycle; use {@link decode} for values from outside the program. */
export const make = <T extends object>(
  tokens: T,
  values: Values<T> | LiteralValues<T>,
): Theme => makeWith(tokens, values, false)

// NOTE: values a schema has decoded already hold their kinds, so `isDecoded`
// skips checking each one again.
const makeWith = (tokens: object, values: unknown, isDecoded: boolean): Theme => {
  const declarations: Array<readonly [string, string]> = []
  collect(tokens, values, [], declarations, true, isDecoded)
  return makeTheme(declarations, tokensOf(tokens))
}

/** A theme that overrides part of `theme`, such as a brand's accent over a base palette. It
 *  declares every token of `theme` again, not only the overrides, so applying it in a scope
 *  re-resolves the aliases there too. Checks values the way {@link make} does. */
export const extend = <T extends object>(
  theme: Theme,
  tokens: T,
  values: PartialValues<T> | PartialLiteralValues<T>,
): Theme => extendWith(theme, tokens, values, false)

const extendWith = (
  theme: Theme,
  tokens: object,
  values: unknown,
  isDecoded: boolean,
): Theme => {
  const unioned = unionTokens(theme.tokens, tokensOf(tokens))
  const overrides: Array<readonly [string, string]> = []
  collect(tokens, values, [], overrides, false, isDecoded)
  const merged = new Map(theme.declarations)
  for (const [name, value] of overrides) {
    merged.set(name, value)
  }
  return makeTheme([...merged], unioned)
}

/** A theme for a nested scope that overrides some tokens of `base`, such as a section with
 *  its own brand. Applied inside a scope where `base` applies, it gives every token the value
 *  `base` extended with the overrides would, without declaring all of `base` again.
 *
 *  It declares the overrides, and every alias in `base` that depends on one, directly or
 *  through other aliases, as `base` declares it. An alias resolves where it is declared, so
 *  re-declaring it in the scope makes it follow the scope's overrides. Every other token
 *  keeps what the scope inherits, such as a density set by a scope in between, which a
 *  whole theme from {@link extend} would reset.
 *
 *  Only aliases `base` declares are re-declared, so pass the theme that holds them, merged
 *  with {@link merge} if they come from several. An alias some other scope declares, between
 *  the root and this one, is not re-declared and keeps its value. Checks values the way
 *  {@link make} does.
 *
 *  ```ts
 *  const orchard = Theme.patch(light, tokens, { brand: { 600: '#c2410c' } })
 *  // declares --brand-600, and --accent and --button-background, which alias it
 *  ``` */
export const patch = <T extends object>(
  base: Theme,
  tokens: T,
  values: PartialValues<T> | PartialLiteralValues<T>,
): Theme => {
  const unioned = unionTokens(base.tokens, tokensOf(tokens))
  const overrides: Array<readonly [string, string]> = []
  collect(tokens, values, [], overrides, false, false)
  const overridden = new Map(overrides)
  const affected = new Set(overridden.keys())
  for (let isGrowing = true; isGrowing;) {
    isGrowing = false
    for (const [name, value] of base.declarations) {
      if (
        !affected.has(name) &&
        [...value.matchAll(REFERENCE)].some(([, target]) => affected.has(target ?? ''))
      ) {
        affected.add(name)
        isGrowing = true
      }
    }
  }
  const declarations: Array<readonly [string, string]> = []
  for (const [name, value] of base.declarations) {
    if (affected.has(name)) {
      declarations.push([name, overridden.get(name) ?? value])
      overridden.delete(name)
    }
  }
  return makeTheme([...declarations, ...overridden], unioned)
}

/** One theme from two that set independent tokens, such as a palette and a component
 *  library's tokens, to apply at one selector. Declarations keep their order, `self` first.
 *
 *  Throws when two different tokens share a custom property name, or when both themes set
 *  one token to different values; overriding is what {@link extend} is for. Also throws when
 *  the merged aliases form a cycle. Otherwise merging is
 *  associative and idempotent, with {@link empty} as its identity, and the order of
 *  arguments changes only the order of declarations. */
export const merge = (self: Theme, that: Theme): Theme => {
  const tokens = unionTokens(self.tokens, that.tokens)
  const declarations = new Map(self.declarations)
  for (const [name, value] of that.declarations) {
    const existing = declarations.get(name)
    if (existing !== undefined && existing !== value) {
      throw new Error(
        `[pleat] Both themes set ${name} (${existing} and ${value}). ` +
          'Use Theme.extend to override a value.',
      )
    }
    declarations.set(name, value)
  }
  return makeTheme([...declarations], tokens)
}

/** A rule about a whole theme that checks on single values can't express, such as a
 *  contrast target between a text color and its background, or an accent that must differ
 *  from the surface. It gets the theme, so {@link resolve} can follow its aliases, and
 *  returns what a `Schema.makeFilter` predicate returns: nothing when the theme passes, or
 *  the failures, each a message or a `{ path, issue }` that points at a token.
 *
 *  ```ts
 *  const accentStandsOut: Theme.Check = theme =>
 *    Equal.equals(Theme.resolve(theme, color.accent), Theme.resolve(theme, color.surface))
 *      ? { path: color.accent.path, issue: 'The accent is the same color as the surface' }
 *      : undefined
 *  ``` */
export type Check = (theme: Theme) => Schema.FilterOutput

/** Options for {@link decode} and {@link decodePartial}. */
export type DecodeOptions = Readonly<{ checks?: ReadonlyArray<Check> }>

// NOTE: one call decodes one input, so the theme is built once and shared
// by every check and the result.
const decodeWith = <V>(
  codec: Schema.Codec<V, unknown>,
  build: (values: V) => Theme,
  input: unknown,
  options: DecodeOptions,
): Effect.Effect<Theme, Schema.SchemaError> => {
  let built: Readonly<{ values: V; theme: Theme }> | undefined
  const themeOf = (values: V): Theme => {
    if (built?.values !== values) {
      built = { values, theme: build(values) }
    }
    return built.theme
  }
  const [first, ...rest] = (options.checks ?? []).map(check =>
    Schema.makeFilter<V>(values => check(themeOf(values))),
  )
  const checked = first === undefined ? codec : codec.check(first, ...rest)
  return Effect.map(
    Schema.decodeUnknownEffect(checked)(input, { errors: 'all' }),
    themeOf,
  )
}

/** Decodes theme values from unknown input, such as a language model's structured output,
 *  and builds the theme. Fails with a `SchemaError` that lists every wrong value, each with
 *  its path and the kind it should have been, such as
 *  `Expected a CSS length, such as 0.75rem or 12px at ["space"]["2"]`.
 *
 *  Pass `checks` for rules about the whole theme, such as contrast between a text color and
 *  its background. They run on the built theme once every value has its kind, and their
 *  failures join the same error. */
export const decode = <T extends object>(
  tokens: T,
  input: unknown,
  options: DecodeOptions = {},
): Effect.Effect<Theme, Schema.SchemaError> =>
  decodeWith(schema(tokens), values => makeWith(tokens, values, true), input, options)

/** Decodes values for some tokens from unknown input, such as a brand kit from a settings
 *  form, and extends `base` with them the way {@link extend} does. Tokens the input leaves
 *  out keep `base`'s values, so `tokens` can be the whole tree. Fails with a `SchemaError`
 *  that lists every wrong value, as {@link decode} does. `checks` run on the extended theme.
 *
 *  ```ts
 *  Theme.decodePartial(light, tokens, { color: { accent: '#ff6600' } })
 *  ``` */
export const decodePartial = <T extends object>(
  base: Theme,
  tokens: T,
  input: unknown,
  options: DecodeOptions = {},
): Effect.Effect<Theme, Schema.SchemaError> =>
  decodeWith(
    partialSchema(tokens),
    values => extendWith(base, tokens, values, true),
    input,
    options,
  )

/** The rule that applies `theme` at `selector`. */
export const css = (theme: Theme, selector: string = ':root'): string =>
  `${selector}{${theme.declarations.map(([name, value]) => `${name}:${value}`).join(';')}}`

/** The theme's declarations as {@link Var.Binding}s, to apply it to one element through an
 *  inline style, next to the element's other bindings. With `@pleat/foldkit`:
 *
 *  ```ts
 *  h.div([...css(card, Var.bind(progress, model.percent), ...Theme.bindings(theme))], children)
 *  ```
 *
 *  Its values were checked when the theme was made, so a theme decoded from outside the
 *  program is safe to bind. Like a theme applied at a selector, its aliases resolve on this
 *  element, and descendants inherit the results. */
export const bindings = (theme: Theme): ReadonlyArray<Binding> =>
  theme.declarations.map(([name, value]) => ({ _tag: 'Binding', name, value }))

// RESOLVING

// NOTE: the index just past the `)` that closes the bracket opened before
// `start`, skipping quoted strings. -1 when it never closes.
const closingBracket = (value: string, start: number): number => {
  let depth = 1
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"' || character === "'") {
      const end = value.indexOf(character, index + 1)
      index = end === -1 ? value.length : end
    } else if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
  }
  return -1
}

// NOTE: replaces every `var(--name)` and `var(--name, fallback)` in `value`
// with what `lookup` gives the name, or with its fallback when the lookup
// gives nothing. None when a reference has neither, which is what makes the
// whole declaration invalid in CSS.
const substitute = (
  value: string,
  lookup: (name: string) => Option.Option<string>,
): Option.Option<string> => {
  let result = ''
  let index = 0
  for (;;) {
    const start = value.indexOf('var(', index)
    if (start === -1) {
      return Option.some(result + value.slice(index))
    }
    const end = closingBracket(value, start + 4)
    if (end === -1) {
      return Option.none()
    }
    const inner = value.slice(start + 4, end - 1)
    const comma = inner.indexOf(',')
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
    const resolved = Option.orElse(lookup(name), () =>
      comma === -1 ? Option.none() : substitute(inner.slice(comma + 1).trim(), lookup),
    )
    if (Option.isNone(resolved)) {
      return resolved
    }
    result += value.slice(index, start) + resolved.value
    index = end
  }
}

/** The value a token ends up with, following aliases the way CSS does, or None when it has
 *  no value: no scope sets it, or an alias it follows points at nothing and has no
 *  fallback. Use it for checks that need concrete values, such as contrast between a text
 *  color and its background.
 *
 *  `scopes` are the themes applied from the outside in, such as the theme at `:root`, then
 *  one on a section, then one on a card inside it. Pass one theme for one scope. The result
 *  is the value inside the innermost scope.
 *
 *  An alias resolves in the scope that declares it, and inner scopes inherit the result, as
 *  in CSS. So if `:root` sets `accent` to alias `brand`, and an inner scope sets only
 *  `brand`, `accent` inside it still holds the root's brand.
 *
 *  ```ts
 *  Theme.resolve(light, tokens.color.accent) // Option.some('oklch(55% 0.2 255)')
 *  Theme.resolve([light, brandOnly], tokens.color.accent) // still light's accent
 *  ``` */
export const resolve = (
  scopes: Theme | ReadonlyArray<Theme>,
  token: Ref,
): Option.Option<string> => {
  const layers = (isTheme(scopes) ? [scopes] : scopes).map(
    theme => new Map(theme.declarations),
  )
  const valueIn = (
    scope: number,
    name: string,
    visiting: ReadonlySet<string>,
  ): Option.Option<string> => {
    let declaring = scope
    while (declaring >= 0 && layers[declaring]?.has(name) !== true) {
      declaring -= 1
    }
    const value = layers[declaring]?.get(name)
    const key = `${declaring}:${name}`
    if (value === undefined || visiting.has(key)) {
      return Option.none()
    }
    const inside = new Set(visiting).add(key)
    return substitute(value, reference => valueIn(declaring, reference, inside))
  }
  return valueIn(layers.length - 1, token.name, new Set())
}

const isTheme = (value: Theme | ReadonlyArray<Theme>): value is Theme =>
  '_tag' in value && value._tag === 'Theme'

export type { Kind, Spec, Tokens }
