import { Schema } from 'effect'
import type * as JsonSchema from 'effect/JsonSchema'
import { type Pipeable, pipeArguments } from 'effect/Pipeable'

import type { Declarations } from './declarations.ts'
import * as Style from './style.ts'

// TYPES

/** One variant dimension: option name to style. Options named `true` and `false` make a
 *  boolean dimension, which takes both booleans even when it names only one of them: the
 *  branch it leaves out is the empty style. A dimension needs at least one option. */
export type Options = Readonly<Record<string, Style.Style | Declarations>>

/** Every variant dimension of a recipe. */
export type Variants = Readonly<Record<string, Options>>

/** The value a dimension takes: `boolean` for `true`/`false` options, otherwise an option name. */
export type OptionValue<O extends Options> = [keyof O] extends ['true' | 'false']
  ? boolean
  : Extract<keyof O, string>

/** A recipe's shape: each dimension and the values it takes. Recipes are typed by their
 *  shape alone, so their types stay small and portable whatever the option styles are. */
export type Shape = Readonly<Record<string, string | boolean>>

/** The shape of a set of variants. */
export type ShapeOf<V extends Variants> = {
  readonly [Dimension in keyof V]: OptionValue<V[Dimension]>
}

/** What a recipe is called with: dimensions with defaults are optional. */
export type Props<S extends Shape, D extends Partial<S>> = {
  readonly [
    Dimension in keyof S as Dimension extends keyof D ? never : Dimension
  ]: S[Dimension]
} & {
  readonly [Dimension in keyof S as Dimension extends keyof D ? Dimension : never]?:
    | S[Dimension]
    | undefined
}

type FieldSchema<A> = [A] extends [boolean]
  ? Schema.Boolean
  : Schema.Literals<ReadonlyArray<Extract<A, string>>>

/** The Schema fields of a recipe's props. */
export type Fields<S extends Shape, D extends Partial<S>> = {
  readonly [Dimension in keyof S]: Dimension extends keyof D
    ? Schema.optionalKey<FieldSchema<S[Dimension]>>
    : FieldSchema<S[Dimension]>
}

/** A style that applies when every named dimension has the named option. */
export type Compound<V extends Variants> = Readonly<{
  when: Partial<ShapeOf<V>>
  style: Style.Style | Declarations
}>

/** What {@link make} takes. */
export type Config<V extends Variants, D extends Partial<ShapeOf<V>>> = Readonly<{
  /** Names the recipe in its schema, for documentation and generated interfaces. */
  name?: string
  /** Describes the recipe in its schema. A language model reads this. */
  description?: string
  /** Styles every option shares. */
  base?: Style.Style | Declarations
  variants: V
  /** The option each dimension takes when props leave it out. */
  defaults?: D
  /** Extra styles for particular combinations, applied after the variants, in order. */
  compounds?: ReadonlyArray<Compound<V>>
  /** Describes each dimension in the schema. */
  descriptions?: { readonly [Dimension in keyof V]?: string }
}>

const TypeId = '~@pleat/core/Recipe'

/** A finite family of styles indexed by variant props: `button({ tone: 'Primary' })`.
 *
 *  Every option's style is defined up front, so every rule a recipe can produce is known
 *  before the first render. Calling the recipe only picks among them, which is a few map
 *  lookups after the first call for each combination. In category terms a recipe is a
 *  selective functor: the branches are static, the choice is made at run time.
 *
 *  The props are described by {@link Recipe.schema}, so a language model can be asked for
 *  them with JSON Schema and its answer decoded before it reaches the view. */
export interface Recipe<S extends Shape, D extends Partial<S>> extends Pipeable {
  (props: Props<S, D>): Style.Style
  readonly [TypeId]: typeof TypeId
  readonly name: string | undefined
  /** The option values of each dimension, in declaration order. */
  readonly dimensions: { readonly [Dimension in keyof S]: ReadonlyArray<S[Dimension]> }
  readonly defaults: D
  /** Validates and describes props. */
  readonly schema: Schema.Struct<Fields<S, D>>
}

/** What every recipe has, whatever its variants. */
export type Any = Readonly<{
  name: string | undefined
  dimensions: Readonly<Record<string, ReadonlyArray<string | boolean>>>
  schema: Schema.Top
}>

/** Whether `value` is a recipe. */
export const isRecipe = (value: unknown): value is Any =>
  typeof value === 'function' && TypeId in value

// CONSTRUCTOR

const RESULT = Symbol('result')
type CacheNode = Map<string | typeof RESULT, CacheNode | Style.Style>

const BOOLEAN_OPTIONS: ReadonlyArray<string> = ['true', 'false']

const isBooleanDimension = (options: Options): boolean =>
  Object.keys(options).length > 0 &&
  Object.keys(options).every(option => BOOLEAN_OPTIONS.includes(option))

// NOTE: a boolean dimension takes both booleans, as its props type and schema
// say, so the branch it leaves out is listed after the ones it names.
const optionNames = (options: Options): ReadonlyArray<string> => {
  const names = Object.keys(options)
  return isBooleanDimension(options)
    ? [...names, ...BOOLEAN_OPTIONS.filter(option => !names.includes(option))]
    : names
}

const toStyle = (input: Style.Style | Declarations): Style.Style =>
  Style.isStyle(input) ? input : Style.make(input)

/** Creates a {@link Recipe}.
 *
 *  ```ts
 *  const button = Recipe.make({
 *    name: 'Button',
 *    base: { display: 'inline-flex', borderRadius: radius.md },
 *    variants: {
 *      tone: { Primary: primaryStyle, Neutral: neutralStyle },
 *      size: { Small: { paddingInline: 8 }, Medium: { paddingInline: 12 } },
 *      isPending: { true: { opacity: 0.6 }, false: {} },
 *    },
 *    defaults: { tone: 'Neutral', size: 'Medium', isPending: false },
 *  })
 *
 *  button({ tone: 'Primary' })
 *  ``` */
export const make = <const V extends Variants, const D extends Partial<ShapeOf<V>> = {}>(
  config: Config<V, D>,
): Recipe<{ readonly [Dimension in keyof V]: OptionValue<V[Dimension]> }, D> => {
  const base = config.base === undefined ? Style.empty : toStyle(config.base)
  const dimensionNames = Object.keys(config.variants)
  const defaults: Readonly<Record<string, unknown>> = config.defaults ?? {}

  for (const dimension of dimensionNames) {
    if (Object.keys(config.variants[dimension] ?? {}).length === 0) {
      throw new Error(
        `[pleat] Recipe ${config.name ?? ''}: dimension ${dimension} has no options. ` +
          'Give it at least one, or leave it out.',
      )
    }
  }

  const optionStyles = new Map<string, ReadonlyMap<string, Style.Style>>(
    dimensionNames.map(dimension => {
      const options = config.variants[dimension] ?? {}
      return [
        dimension,
        new Map(
          optionNames(options).map(option => {
            const input = options[option]
            return [option, input === undefined ? Style.empty : toStyle(input)]
          }),
        ),
      ]
    }),
  )
  const compounds = (config.compounds ?? []).map(compound => ({
    when: Object.entries(compound.when).map(
      ([dimension, value]) => [dimension, String(value)] as const,
    ),
    style: toStyle(compound.style),
  }))

  for (const [dimension, value] of Object.entries(defaults)) {
    if (!optionStyles.get(dimension)?.has(String(value))) {
      throw new Error(
        `[pleat] Recipe ${config.name ?? ''} defaults ${dimension} to ${JSON.stringify(value)}, ` +
          'which is not one of its options.',
      )
    }
  }

  const compose = (path: ReadonlyArray<string>): Style.Style => {
    const chosen = new Map(
      dimensionNames.map((dimension, index) => [dimension, path[index]]),
    )
    const variantStyles = dimensionNames.flatMap((dimension, index) => {
      const style = optionStyles.get(dimension)?.get(path[index] ?? '')
      return style === undefined ? [] : [style]
    })
    const compoundStyles = compounds
      .filter(compound =>
        compound.when.every(([dimension, value]) => chosen.get(dimension) === value),
      )
      .map(compound => compound.style)
    return Style.mergeAll([base, ...variantStyles, ...compoundStyles])
  }

  const root: CacheNode = new Map()

  const resolve = (props: Readonly<Record<string, unknown>>): Style.Style => {
    let node = root
    for (const dimension of dimensionNames) {
      const raw = props[dimension] ?? defaults[dimension]
      const option = String(raw)
      let next = node.get(option)
      if (next === undefined) {
        if (raw === undefined || !optionStyles.get(dimension)?.has(option)) {
          throw new Error(
            `[pleat] Recipe ${config.name ?? ''} got ${JSON.stringify(raw)} for ${dimension}. ` +
              `Expected one of: ${[...(optionStyles.get(dimension)?.keys() ?? [])].join(', ')}.`,
          )
        }
        next = new Map()
        node.set(option, next)
      }
      if (next instanceof Map) {
        node = next
      }
    }
    const cached = node.get(RESULT)
    if (cached !== undefined && !(cached instanceof Map)) {
      return cached
    }
    const style = compose(
      dimensionNames.map(dimension => String(props[dimension] ?? defaults[dimension])),
    )
    node.set(RESULT, style)
    return style
  }

  const fields: Record<string, Schema.Top> = {}
  for (const dimension of dimensionNames) {
    const options = config.variants[dimension] ?? {}
    const annotations = {
      description: config.descriptions?.[dimension],
    }
    const field = isBooleanDimension(options)
      ? Schema.Boolean.annotate(annotations)
      : Schema.Literals(Object.keys(options)).annotate(annotations)
    fields[dimension] = dimension in defaults ? Schema.optionalKey(field) : field
  }
  const schema = Schema.Struct(fields).annotate({
    ...(config.name === undefined ? {} : { identifier: config.name, title: config.name }),
    ...(config.description === undefined ? {} : { description: config.description }),
  })

  const dimensions = Object.fromEntries(
    dimensionNames.map(dimension => {
      const options = config.variants[dimension] ?? {}
      const names = optionNames(options)
      return [
        dimension,
        isBooleanDimension(options) ? names.map(option => option === 'true') : names,
      ]
    }),
  )

  // NOTE: the props type and schema are mapped from the config's keys, which
  // only exist at run time here. The runtime values are built to match.
  Object.defineProperty(resolve, 'name', { value: config.name })
  return Object.assign(resolve, {
    [TypeId]: TypeId,
    dimensions,
    defaults: config.defaults ?? {},
    schema,
    pipe(this: unknown) {
      return pipeArguments(this, arguments)
    },
  }) as unknown as Recipe<
    { readonly [Dimension in keyof V]: OptionValue<V[Dimension]> },
    D
  >
}

// QUERIES

/** Every combination of options, with its style. For galleries, tests, and precomputation. */
export const combinations = <S extends Shape, D extends Partial<S>>(
  recipe: Recipe<S, D>,
): ReadonlyArray<Readonly<{ props: S; style: Style.Style }>> => {
  const entries: ReadonlyArray<readonly [string, ReadonlyArray<unknown>]> =
    Object.entries(recipe.dimensions)
  const selections = entries.reduce<ReadonlyArray<Record<string, unknown>>>(
    (partial, [dimension, options]) =>
      partial.flatMap(selection =>
        options.map(option => ({ ...selection, [dimension]: option })),
      ),
    [{}],
  )
  return selections.map(selection => {
    // NOTE: each selection holds one listed value per dimension, which is an S,
    // and a complete S is valid props whatever the defaults are.
    const props = selection as S
    return { props, style: recipe(props as unknown as Props<S, D>) }
  })
}

/** The JSON Schema document for a recipe's props, for structured output and tool calls.
 *  Objects are closed (`additionalProperties: false`), which strict structured-output modes
 *  require; pass `onExcessProperty: 'ignore'` to leave them open. */
export const jsonSchema = (
  recipe: Any,
  options: Schema.ToJsonSchemaOptions = {},
): JsonSchema.Document<'draft-2020-12'> =>
  Schema.toJsonSchemaDocument(recipe.schema, { onExcessProperty: 'error', ...options })
