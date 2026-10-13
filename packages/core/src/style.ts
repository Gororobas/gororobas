import { Equal, Hash, Option } from 'effect'
import * as Combiner from 'effect/Combiner'
import { dual } from 'effect/Function'
import { type Inspectable, NodeInspectSymbol } from 'effect/Inspectable'
import { type Pipeable, pipeArguments } from 'effect/Pipeable'
import * as Reducer from 'effect/Reducer'

import {
  type Declarations,
  entriesOf,
  formatValue,
  renderDeclaration,
} from './declarations.ts'
import { digest, hash32 } from './hash.ts'
import { overlapsPartially, shadows } from './property.ts'
import { type Atom, compareAtoms, insert, makeAtom, registerAtom } from './sheet.ts'
import type { Value } from './var.ts'
import * as When from './when.ts'

// MODEL

const TypeId = '~@pleat/core/Style'

/** A style: a set of declarations, each under a condition, compiled to atomic classes.
 *
 *  Styles form an idempotent monoid under {@link merge}, with {@link empty} as identity.
 *  Merging is "apply the right side after the left side", per property and per condition,
 *  so `merge(a, b)` reads like `{ ...a, ...b }` and keeps reading that way when shorthands
 *  meet longhands (`padding` then `paddingTop`). Merging a style with itself changes nothing.
 *
 *  Equal styles are the same object, so they work as `Equal` keys and memoize by identity.
 *
 *  Where "apply after" stops being exact:
 *
 *  - `all` is rejected. It resets every other property, and atomic rules can't order it
 *    against them. Reset elements with `Global.rule`, or write the properties you mean.
 *  - Pleat knows which longhands a shorthand sets for margin, padding, inset, gap, overflow,
 *    border and its sides, aspects, and logical forms, borderRadius, borderImage, outline,
 *    background, backgroundPosition, mask, font, flex, flexFlow, grid, gridTemplate,
 *    gridArea, gridRow, gridColumn, columns, columnRule, listStyle, textDecoration,
 *    textEmphasis, transition, animation, animationRange, fontVariant, container,
 *    containIntrinsicSize, the place shorthands, and scrollMargin and scrollPadding,
 *    including longhands a shorthand only resets, such as font's `fontKerning` and
 *    animation's `animationTimeline`. Every other property is treated as a longhand.
 *  - Shorthands that share only some longhands (`borderTop` and `borderColor`), and logical
 *    and physical properties for one side, are ordered by property priority rather than by
 *    when they were written. Pleat warns about the first in development. */
export interface Style extends Pipeable, Inspectable, Equal.Equal {
  readonly [TypeId]: typeof TypeId
  /** The atoms, sorted by class name. */
  readonly atoms: ReadonlyArray<Atom>
  /** The class attribute value: every atom's class, sorted. Also the style's identity. */
  readonly className: string
}

const StyleProto: Omit<Style, 'atoms' | 'className'> = {
  [TypeId]: TypeId,
  [Equal.symbol](this: Style, that: Equal.Equal): boolean {
    return isStyle(that) && that.className === this.className
  },
  [Hash.symbol](this: Style): number {
    return hash32(this.className)
  },
  pipe() {
    return pipeArguments(this, arguments)
  },
  toJSON(this: Style) {
    return { _id: 'Style', className: this.className, declarations: declarations(this) }
  },
  toString(this: Style) {
    return this.className
  },
  [NodeInspectSymbol](this: Style) {
    return this.toJSON()
  },
}

/** Whether `value` is a {@link Style}. */
export const isStyle = (value: unknown): value is Style =>
  typeof value === 'object' && value !== null && TypeId in value

// INTERNING

const INTERN_LIMIT = 20_000
const interned = new Map<string, Style>()

const fromNormalizedAtoms = (atoms: ReadonlyArray<Atom>): Style => {
  const sorted = [...atoms].sort((left, right) =>
    left.className < right.className ? -1 : 1,
  )
  const className = sorted.map(atom => atom.className).join(' ')
  const existing = interned.get(className)
  if (existing !== undefined) {
    return existing
  }
  const style = Object.create(StyleProto)
  style.atoms = sorted
  style.className = className
  if (interned.size >= INTERN_LIMIT) {
    interned.clear()
  }
  interned.set(className, style)
  return style
}

// NORMALIZATION

const reportedOverlaps = new Set<string>()

const reportOverlap = (earlier: Atom, later: Atom): void => {
  const key = `${earlier.slot}→${later.slot}`
  if (reportedOverlaps.has(key) || typeof console === 'undefined') {
    return
  }
  reportedOverlaps.add(key)
  console.warn(
    `[pleat] ${later.property} was applied after ${earlier.property}. They set some of ` +
      'the same longhands without one containing the other, so atomic rules order them by ' +
      'property priority rather than by when they were applied. Write one of them as longhands.',
  )
}

// NOTE: atoms are applied in order. A later atom removes earlier atoms under
// the same condition whose longhands it covers. Removal depends only on the
// later atom, and "covers" is transitive, so normalizing in pieces and then
// together gives the same result; that is what makes merge associative.
const normalize = (writes: Iterable<Atom>): ReadonlyArray<Atom> => {
  const byCondition = new Map<string, Map<string, Atom>>()
  for (const atom of writes) {
    if (atom._tag === 'Marker') {
      const group = byCondition.get('marker') ?? new Map<string, Atom>()
      group.set(atom.slot, atom)
      byCondition.set('marker', group)
      continue
    }
    const group = byCondition.get(atom.condition.key) ?? new Map<string, Atom>()
    for (const [property, earlier] of group) {
      if (shadows(atom.property, property)) {
        group.delete(property)
      } else if (overlapsPartially(property, atom.property)) {
        reportOverlap(earlier, atom)
      }
    }
    group.set(atom.property, atom)
    byCondition.set(atom.condition.key, group)
  }
  return [...byCondition.values()].flatMap(group => [...group.values()])
}

const fromWrites = (writes: Iterable<Atom>): Style =>
  fromNormalizedAtoms(normalize(writes))

// NOTE: a normalized style keeps a longhand next to its shorthand only when
// the longhand was written later, so replaying atoms by condition and then by
// property priority (shorthands first) reproduces an order that normalizes to
// the same style. Sorting by class name would not.
const replayOrder = (style: Style): ReadonlyArray<Atom> =>
  [...style.atoms].sort(compareAtoms)

const CLASS_PREFIX = 'p'

const atomFor = (condition: When.Condition, property: string, value: string): Atom => {
  const key = `${condition.key}{${property}:${value}}`
  return registerAtom(
    makeAtom(
      condition,
      property,
      value,
      `${CLASS_PREFIX}${digest(key)}`,
      renderDeclaration(property, value),
    ),
  )
}

// CONSTRUCTORS

const checkSupported = (property: string): void => {
  if (property === 'all') {
    throw new Error(
      "[pleat] Style can't hold `all`. It resets every other property, and atomic rules " +
        "can't order it against them. Reset elements with Global.rule, or write the " +
        'properties you mean.',
    )
  }
}

/** The style with no declarations. The identity of {@link merge}. */
export const empty: Style = fromNormalizedAtoms([])

/** A style from a declaration block. Later keys win over earlier ones the way they would in
 *  an inline style, including a shorthand written after its longhands. Throws on `all`; see
 *  {@link Style} for what else "later wins" covers.
 *
 *  ```ts
 *  const card = Style.make({ display: 'grid', gap: 12, padding: 16, color: tokens.color.ink })
 *  ``` */
export const make = (declarations: Declarations): Style =>
  fromWrites(
    entriesOf(declarations).map(([property, value]) => {
      checkSupported(property)
      return atomFor(When.always, property, value)
    }),
  )

/** A style that puts `marker`'s class on an element, so relational conditions such as
 *  `When.within(marker, When.hover)` can point at it. */
export const mark = (marker: When.Marker): Style =>
  fromNormalizedAtoms([
    registerAtom({
      _tag: 'Marker',
      key: `marker:${marker.name}`,
      condition: When.always,
      property: '',
      value: '',
      className: marker.className,
      slot: `marker|${marker.name}`,
      priority: 0,
      rule: '',
    }),
  ])

const toStyle = (input: Style | Declarations): Style =>
  isStyle(input) ? input : make(input)

// COMBINATORS

const mergeCache = new WeakMap<Style, WeakMap<Style, Style>>()

/** Applies `that` after `self`. Associative, with {@link empty} as identity, and idempotent:
 *  `merge(a, a)` is `a`. Results are memoized, so merging in a view costs a lookup. */
export const merge: {
  (that: Style): (self: Style) => Style
  (self: Style, that: Style): Style
} = dual(2, (self: Style, that: Style): Style => {
  if (self === empty || self === that) {
    return that
  }
  if (that === empty) {
    return self
  }
  const cached = mergeCache.get(self)?.get(that)
  if (cached !== undefined) {
    return cached
  }
  const merged = fromWrites([...replayOrder(self), ...replayOrder(that)])
  const forSelf = mergeCache.get(self) ?? new WeakMap<Style, Style>()
  forSelf.set(that, merged)
  mergeCache.set(self, forSelf)
  return merged
})

/** Merges styles left to right. `mergeAll([])` is {@link empty}. */
export const mergeAll = (styles: Iterable<Style>): Style => {
  let result = empty
  for (const style of styles) {
    result = merge(result, style)
  }
  return result
}

/** Merging, as an Effect `Combiner`. */
export const Combiner_: Combiner.Combiner<Style> = Combiner.make(merge)

/** Merging with {@link empty}, as an Effect `Reducer`, so styles fold with Effect's tools. */
export const Reducer_: Reducer.Reducer<Style> = Reducer.make(merge, empty, mergeAll)

const conditioned = (condition: When.Condition, style: Style): Style =>
  When.isAlways(condition)
    ? style
    : fromWrites(
        replayOrder(style).map(atom =>
          atom._tag === 'Marker'
            ? atom
            : atomFor(When.all(condition, atom.condition), atom.property, atom.value),
        ),
      )

/** Adds declarations that apply only under `condition`, after the ones already in the style.
 *
 *  ```ts
 *  const link = Style.make({ color: ink }).pipe(
 *    Style.when(When.hover, { color: accent }),
 *    Style.when(When.all(When.dark, When.hover), { color: accentOnDark }),
 *  )
 *  ```
 *
 *  `when` distributes over merge, and nesting conjoins: `when(c, when(d, s))` equals
 *  `when(all(c, d), s)`. */
export const when: {
  (condition: When.Condition, input: Style | Declarations): (self: Style) => Style
  (self: Style, condition: When.Condition, input: Style | Declarations): Style
} = dual(
  3,
  (self: Style, condition: When.Condition, input: Style | Declarations): Style =>
    merge(self, conditioned(condition, toStyle(input))),
)

/** The style with every declaration moved under `condition`. A monoid homomorphism. */
export const under: {
  (condition: When.Condition): (self: Style) => Style
  (self: Style, condition: When.Condition): Style
} = dual(2, (self: Style, condition: When.Condition): Style =>
  conditioned(condition, self),
)

/** Maps declaration values. Each function receives the current value and returns a new one.
 *  Runs once, where the style is defined, so it can use any function and still compile to
 *  static rules. Distributes over merge.
 *
 *  ```ts
 *  const bumpFontSize = Style.evolve({ fontSize: size => Calc.add(size, 4) })
 *  const darkenText = Style.evolve({ color: color => Color.darken(color, 0.1) })
 *  ``` */
export const evolve: {
  (transforms: {
    readonly [Property in keyof Declarations]?: (value: string) => Value
  }): (self: Style) => Style
  (
    self: Style,
    transforms: { readonly [Property in keyof Declarations]?: (value: string) => Value },
  ): Style
} = dual(
  2,
  (
    self: Style,
    transforms: { readonly [Property in keyof Declarations]?: (value: string) => Value },
  ): Style => {
    const byProperty = new Map<string, (value: string) => Value>()
    for (const [property, transform] of Object.entries(transforms)) {
      if (typeof transform === 'function') {
        byProperty.set(property, transform)
      }
    }
    return mapDeclarations(self, (property, value) => {
      const transform = byProperty.get(property)
      return transform === undefined ? value : transform(value)
    })
  },
)

/** Maps every declaration. Return `undefined` to drop it. */
export const mapDeclarations: {
  (
    f: (property: string, value: string, condition: When.Condition) => Value | undefined,
  ): (self: Style) => Style
  (
    self: Style,
    f: (property: string, value: string, condition: When.Condition) => Value | undefined,
  ): Style
} = dual(
  2,
  (
    self: Style,
    f: (property: string, value: string, condition: When.Condition) => Value | undefined,
  ): Style =>
    fromWrites(
      replayOrder(self).flatMap(atom => {
        if (atom._tag === 'Marker') {
          return [atom]
        }
        const next = f(atom.property, atom.value, atom.condition)
        if (next === undefined) {
          return []
        }
        const [entry] = entriesOf({ [atom.property]: formatValue(atom.property, next) })
        return entry === undefined ? [] : [atomFor(atom.condition, entry[0], entry[1])]
      }),
    ),
)

// QUERIES

/** The value `style` declares for `property` under exactly `condition` (default: always). */
export const get = (
  style: Style,
  property: keyof Declarations,
  condition: When.Condition = When.always,
): Option.Option<string> => {
  for (const atom of style.atoms) {
    if (
      atom._tag === 'Declaration' &&
      atom.property === property &&
      atom.condition.key === condition.key
    ) {
      return Option.some(atom.value)
    }
  }
  return Option.none()
}

/** One declaration of a style, for inspection. */
export type Entry = Readonly<{
  /** The condition, described by `When.label`. */
  condition: string
  property: string
  value: string
}>

/** Every declaration of a style, in the order its rules are emitted. */
export const declarations = (style: Style): ReadonlyArray<Entry> =>
  style.atoms
    .filter(atom => atom._tag === 'Declaration')
    .sort(compareAtoms)
    .map(atom => ({
      condition: When.label(atom.condition),
      property: atom.property,
      value: atom.value,
    }))

/** Whether a style declares nothing. */
export const isEmpty = (style: Style): boolean => style.atoms.length === 0

/** The declarations that take effect on an element when the atoms `isActive` accepts hold.
 *  This is the meaning of a style, which the compiled rules reproduce in the browser cascade.
 *  Pseudo-element declarations are left out unless `isActive` accepts their atom.
 *
 *  Use it to test styles, or to draw them somewhere without CSS. */
export const resolve = (
  style: Style,
  isActive: (atom: When.Atom) => boolean = () => false,
): Readonly<Record<string, string>> => {
  const active = style.atoms
    .filter(atom => atom._tag === 'Declaration' && atom.condition.atoms.every(isActive))
    .sort(compareAtoms)
  const resolved = new Map<string, string>()
  for (const atom of active) {
    for (const property of resolved.keys()) {
      if (shadows(atom.property, property)) {
        resolved.delete(property)
      }
    }
    resolved.set(atom.property, atom.value)
  }
  return Object.fromEntries(resolved)
}

// RENDERING

/** The class attribute value for `style`. In a browser, also inserts its rules into the page
 *  the first time the style is used. View adapters call this for you. */
export const use = (style: Style): string => {
  insert(style.atoms)
  return style.className
}

export { Combiner_ as Combiner, Reducer_ as Reducer }
