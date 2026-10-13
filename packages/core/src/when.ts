import { Equal, Hash } from 'effect'
import { type Pipeable, pipeArguments } from 'effect/Pipeable'

import { hash32 } from './hash.ts'

// ATOM

/** One test a condition makes. Conditions are conjunctions of atoms.
 *
 * - `Selector`: a test on the element itself, written inside `:where()` so it adds no specificity.
 * - `AtRule`: an environment test that wraps the rule (`@media`, `@supports`, `@container`).
 * - `PseudoElement`: retargets the rule to a pseudo-element such as `::placeholder`. */
export type Atom =
  | Readonly<{ _tag: 'Selector'; key: string; rank: number; selector: string }>
  | Readonly<{ _tag: 'AtRule'; key: string; rank: number; atRule: string }>
  | Readonly<{
      _tag: 'PseudoElement'
      key: string
      rank: number
      pseudoElement: string
    }>

const selectorAtom = (selector: string, rank: number): Atom => ({
  _tag: 'Selector',
  key: `s${selector}`,
  rank,
  selector,
})

const atRuleAtom = (atRule: string, rank: number): Atom => ({
  _tag: 'AtRule',
  key: `a${atRule}`,
  rank,
  atRule,
})

const pseudoElementAtom = (pseudoElement: string, rank: number): Atom => ({
  _tag: 'PseudoElement',
  key: `e${pseudoElement}`,
  rank,
  pseudoElement,
})

// CONDITION

const TypeId = '~@pleat/core/Condition'

/** When a set of declarations applies: always, or under a conjunction of atoms such as
 *  `:hover`, `[data-open]`, or `@media (prefers-color-scheme: dark)`.
 *
 *  Conditions form a meet-semilattice: {@link all} is the meet, {@link always} is the top. */
export interface Condition extends Pipeable, Equal.Equal {
  readonly [TypeId]: typeof TypeId
  /** The atoms, deduplicated and sorted by key. */
  readonly atoms: ReadonlyArray<Atom>
  /** A canonical identity: equal conditions have equal keys. */
  readonly key: string
}

const ConditionProto: Omit<Condition, 'atoms' | 'key'> = {
  [TypeId]: TypeId,
  [Equal.symbol](this: Condition, that: Equal.Equal): boolean {
    return isCondition(that) && that.key === this.key
  },
  [Hash.symbol](this: Condition): number {
    return hash32(this.key)
  },
  pipe() {
    return pipeArguments(this, arguments)
  },
}

/** Whether `value` is a {@link Condition}. */
export const isCondition = (value: unknown): value is Condition =>
  typeof value === 'object' && value !== null && TypeId in value

const fromAtoms = (atoms: Iterable<Atom>): Condition => {
  const byKey = new Map<string, Atom>()
  for (const atom of atoms) {
    byKey.set(atom.key, atom)
  }
  const sorted = [...byKey.values()].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  )
  const condition = Object.create(ConditionProto)
  condition.atoms = sorted
  condition.key = sorted.map(atom => atom.key).join(' & ')
  return condition
}

/** The condition that always holds. Declarations under it are an element's base styles. */
export const always: Condition = fromAtoms([])

/** Whether `condition` is {@link always}. */
export const isAlways = (condition: Condition): boolean => condition.atoms.length === 0

/** The conjunction of conditions: holds when every one of them holds. */
export const all = (...conditions: ReadonlyArray<Condition>): Condition =>
  fromAtoms(conditions.flatMap(condition => condition.atoms))

// PRECEDENCE

const compareAtoms = (left: Atom, right: Atom): number =>
  left.rank !== right.rank
    ? left.rank - right.rank
    : left.key < right.key
      ? -1
      : left.key > right.key
        ? 1
        : 0

const byPrecedence = (condition: Condition): ReadonlyArray<Atom> =>
  [...condition.atoms].sort((left, right) => compareAtoms(right, left))

/** The total order that decides which declaration wins when several conditions hold at once
 *  and set the same property. A condition outranks another when its strongest atom outranks
 *  the other's strongest atom; ties continue with the next strongest atom, and a condition
 *  that extends another (`all(dark, hover)` over `hover`) outranks it.
 *
 *  Atom ranks, weakest to strongest: environment (`@media`, `@container`), ancestors and
 *  siblings (`within`, `precededBy`, `has`), element state (`[data-open]`, `[data-selected]`), interaction
 *  (`:hover` < `:focus` < `:focus-visible` < `:active`), terminal state (invalid, disabled),
 *  pseudo-elements. */
export const compare = (left: Condition, right: Condition): number => {
  const leftAtoms = byPrecedence(left)
  const rightAtoms = byPrecedence(right)
  const length = Math.min(leftAtoms.length, rightAtoms.length)
  for (let index = 0; index < length; index += 1) {
    const leftAtom = leftAtoms[index]
    const rightAtom = rightAtoms[index]
    if (leftAtom !== undefined && rightAtom !== undefined) {
      const order = compareAtoms(leftAtom, rightAtom)
      if (order !== 0) {
        return order
      }
    }
  }
  return leftAtoms.length - rightAtoms.length
}

// RANKS

const Rank = {
  supports: 100,
  media: 110,
  colorScheme: 112,
  motion: 114,
  contrast: 116,
  print: 118,
  maxWidth: 120,
  minWidth: 130,
  container: 192,
  relational: 200,
  data: 300,
  structure: 305,
  open: 310,
  readonly: 315,
  selected: 320,
  highlighted: 330,
  transition: 340,
  hover: 410,
  focusWithin: 415,
  focus: 420,
  focusVisible: 430,
  active: 440,
  invalid: 510,
  disabled: 520,
  pseudoElement: 900,
} as const

// SELECTOR CONDITIONS

const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/
const PSEUDO_SELECTOR = /^::?[a-z-]+(\([^{};<>]*\))?$/

const quoteAttributeValue = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

const assertAttributeName = (name: string): void => {
  if (!ATTRIBUTE_NAME.test(name)) {
    throw new Error(
      `[pleat] ${JSON.stringify(name)} is not an attribute name Pleat can select on. ` +
        'Use lowercase letters, digits, and dashes.',
    )
  }
}

/** A pseudo-class on the element, such as `:first-child` or `:nth-child(odd)`. */
export const pseudo = (selector: string, rank: number = Rank.structure): Condition => {
  if (!PSEUDO_SELECTOR.test(selector) || selector.startsWith('::')) {
    throw new Error(
      `[pleat] ${JSON.stringify(selector)} is not a pseudo-class. ` +
        'Pass one pseudo-class such as ":first-child"; use pseudoElement for "::before".',
    )
  }
  return fromAtoms([selectorAtom(selector, rank)])
}

/** The element has `data-<name>` (any value), or `data-<name>="<value>"` when `value` is given.
 *  Foldkit UI components describe their state this way: `data-open`, `data-selected`. */
export const data = (name: string, value?: string): Condition => {
  assertAttributeName(name)
  return fromAtoms([
    selectorAtom(
      value === undefined
        ? `[data-${name}]`
        : `[data-${name}=${quoteAttributeValue(value)}]`,
      Rank.data,
    ),
  ])
}

/** The element has `aria-<name>="<value>"`. */
export const aria = (name: string, value: string): Condition => {
  assertAttributeName(name)
  return fromAtoms([
    selectorAtom(`[aria-${name}=${quoteAttributeValue(value)}]`, Rank.data),
  ])
}

const stateSelector = (selector: string, rank: number): Condition =>
  fromAtoms([selectorAtom(selector, rank)])

/** The pointer is over the element. */
export const hover: Condition = stateSelector(':hover', Rank.hover)
/** The element has focus. */
export const focus: Condition = stateSelector(':focus', Rank.focus)
/** The element has focus and the browser would show a focus ring (keyboard focus). */
export const focusVisible: Condition = stateSelector(':focus-visible', Rank.focusVisible)
/** The element or one of its descendants has focus. */
export const focusWithin: Condition = stateSelector(':focus-within', Rank.focusWithin)
/** The element is being pressed. */
export const active: Condition = stateSelector(':active', Rank.active)

/** The element is disabled: native `:disabled`, `data-disabled`, or `aria-disabled="true"`.
 *  Foldkit UI sets the last two, so disabled outranks hover and press. */
export const disabled: Condition = stateSelector(
  ':disabled, [data-disabled], [aria-disabled="true"]',
  Rank.disabled,
)
/** The element is invalid: `data-invalid` or `aria-invalid="true"`. */
export const invalid: Condition = stateSelector(
  '[data-invalid], [aria-invalid="true"]',
  Rank.invalid,
)
/** The element is read-only: `data-readonly` or `aria-readonly="true"`. Native `:read-only`
 *  is left out because it matches every element that is not editable. */
export const readonly: Condition = stateSelector(
  '[data-readonly], [aria-readonly="true"]',
  Rank.readonly,
)
/** The element is checked: native `:checked`, `data-checked`, or `aria-checked="true"`. */
export const checked: Condition = stateSelector(
  ':checked, [data-checked], [aria-checked="true"]',
  Rank.selected,
)
/** The element is in a mixed state: native `:indeterminate`, `data-indeterminate`, or
 *  `aria-checked="mixed"`. Foldkit UI's Checkbox sets the last two in place of
 *  `data-checked`, so a mixed checkbox matches this and not {@link checked}. */
export const indeterminate: Condition = stateSelector(
  ':indeterminate, [data-indeterminate], [aria-checked="mixed"]',
  Rank.selected,
)
/** The element is selected: `data-selected` or `aria-selected="true"`. */
export const selected: Condition = stateSelector(
  '[data-selected], [aria-selected="true"]',
  Rank.selected,
)
/** The element is the current item: `data-current` or `aria-current` other than `false`. */
export const current: Condition = stateSelector(
  '[data-current], [aria-current]:not([aria-current="false"])',
  Rank.selected,
)
/** The element is open: `data-open` or `aria-expanded="true"`. */
export const open: Condition = stateSelector(
  '[data-open], [aria-expanded="true"]',
  Rank.open,
)
/** The element is the highlighted option of a menu, listbox, or combobox (`data-active` in
 *  Foldkit UI). In a Foldkit UI RadioGroup, `data-active` marks the option that holds the
 *  roving tab stop, even while the group has no focus, so use {@link focusVisible} to show
 *  keyboard focus there. */
export const highlighted: Condition = stateSelector('[data-active]', Rank.highlighted)
/** A transitioning element in its closed state (`data-closed`). */
export const closed: Condition = stateSelector('[data-closed]', Rank.transition)
/** A transitioning element while it enters (`data-enter`). */
export const entering: Condition = stateSelector('[data-enter]', Rank.transition)
/** A transitioning element while it leaves (`data-leave`). */
export const leaving: Condition = stateSelector('[data-leave]', Rank.transition)
/** An element with an active transition (`data-transition`). */
export const transitioning: Condition = stateSelector(
  '[data-transition]',
  Rank.transition,
)

/** The element is the first of its siblings. */
export const firstChild: Condition = pseudo(':first-child')
/** The element is the last of its siblings. */
export const lastChild: Condition = pseudo(':last-child')
/** The element is an odd-numbered sibling. */
export const odd: Condition = pseudo(':nth-child(odd)')
/** The element is an even-numbered sibling. */
export const even: Condition = pseudo(':nth-child(even)')
/** The element has no children. */
export const empty: Condition = pseudo(':empty')
/** An input showing its placeholder. */
export const placeholderShown: Condition = pseudo(':placeholder-shown')

// RELATIONAL CONDITIONS

const selectorOf = (condition: Condition, context: string): string => {
  const parts: Array<string> = []
  for (const atom of condition.atoms) {
    if (atom._tag !== 'Selector') {
      throw new Error(
        `[pleat] ${context} takes element conditions only, such as hover or data("open"). ` +
          'Combine environment conditions such as dark with all(...) instead.',
      )
    }
    parts.push(`:where(${atom.selector})`)
  }
  return parts.join('')
}

const relationalRank = (condition: Condition): number =>
  Rank.relational +
  Math.max(0, ...condition.atoms.map(atom => atom.rank - Rank.data)) / 10

/** A named element that relational conditions can point at: `within(card, hover)` means
 *  "inside a hovered card". Put the marker's class on that element with `Style.mark`. */
export interface Marker {
  readonly name: string
  readonly className: string
}

const MARKER_NAME = /^[a-z][a-z0-9-]*$/

/** Creates a {@link Marker}. Names must be unique in the application. */
export const marker = (name: string): Marker => {
  if (!MARKER_NAME.test(name)) {
    throw new Error(
      `[pleat] Marker name ${JSON.stringify(name)} must use lowercase letters, digits, and dashes.`,
    )
  }
  return { name, className: `pm-${name}` }
}

const relational = (
  build: (selector: string) => string,
  markerOrCondition: Marker | Condition,
  maybeCondition: Condition | undefined,
  context: string,
): Condition => {
  const target = isCondition(markerOrCondition)
    ? markerOrCondition
    : (maybeCondition ?? always)
  const markerSelector = isCondition(markerOrCondition)
    ? ''
    : `.${markerOrCondition.className}`
  const selector = `${markerSelector}${selectorOf(target, context)}`
  if (selector === '') {
    throw new Error(`[pleat] ${context} needs a marker or a condition.`)
  }
  return fromAtoms([selectorAtom(build(selector), relationalRank(target))])
}

/** The element is inside an ancestor that matches: `within(When.data('theme', 'dark'))`, or
 *  `within(card, When.hover)` for "inside a hovered element marked `card`". */
export const within: {
  (condition: Condition): Condition
  (marker: Marker, condition?: Condition): Condition
} = (markerOrCondition: Marker | Condition, condition?: Condition) =>
  relational(selector => `${selector} *`, markerOrCondition, condition, 'within')

/** The element comes after a sibling that matches: `precededBy(toggle, When.checked)`. */
export const precededBy: {
  (condition: Condition): Condition
  (marker: Marker, condition?: Condition): Condition
} = (markerOrCondition: Marker | Condition, condition?: Condition) =>
  relational(selector => `${selector} ~ *`, markerOrCondition, condition, 'precededBy')

/** The element contains a descendant that matches: `has(checkbox, When.checked)`. */
export const has: {
  (condition: Condition): Condition
  (marker: Marker, condition?: Condition): Condition
} = (markerOrCondition: Marker | Condition, condition?: Condition) =>
  relational(selector => `:has(${selector})`, markerOrCondition, condition, 'has')

/** The element does not match an element condition. */
export const not = (condition: Condition): Condition => {
  const selector = selectorOf(condition, 'not')
  return fromAtoms([
    selectorAtom(
      `:not(${selector})`,
      Math.max(...condition.atoms.map(atom => atom.rank)),
    ),
  ])
}

// ENVIRONMENT CONDITIONS

const MEDIA_QUERY = /^[^{};<>]+$/

const assertQuery = (query: string, context: string): void => {
  if (!MEDIA_QUERY.test(query) || query.trim() !== query || query === '') {
    throw new Error(
      `[pleat] ${JSON.stringify(query)} is not a ${context} Pleat can wrap a rule in.`,
    )
  }
}

/** A media query, such as `(orientation: portrait)`. */
export const media = (query: string, rank: number = Rank.media): Condition => {
  assertQuery(query, 'media query')
  return fromAtoms([atRuleAtom(`@media ${query}`, rank)])
}

/** A feature query, such as `(backdrop-filter: blur(1px))`. */
export const supports = (query: string): Condition => {
  assertQuery(query, 'feature query')
  return fromAtoms([atRuleAtom(`@supports ${query}`, Rank.supports)])
}

/** A container query against the nearest container, or the named one. */
export const container = (query: string, name?: string): Condition => {
  assertQuery(query, 'container query')
  if (name !== undefined) {
    assertAttributeName(name)
  }
  const prelude = name === undefined ? query : `${name} ${query}`
  return fromAtoms([
    atRuleAtom(
      `@container ${prelude}`,
      Rank.container + Math.min(widthInRem(query), 600) / 100,
    ),
  ])
}

const LENGTH = /(-?\d*\.?\d+)(px|rem|em)/

const widthInRem = (query: string): number => {
  const match = LENGTH.exec(query)
  if (match === null) {
    return 0
  }
  const amount = Number(match[1])
  return match[2] === 'px' ? amount / 16 : amount
}

/** The viewport is at least `width` wide. Wider breakpoints outrank narrower ones, so
 *  mobile-first styles compose in the expected order. */
export const minWidth = (width: string): Condition => {
  const rem = widthInRem(width)
  return media(
    `(min-width: ${width})`,
    Rank.minWidth + Math.min(Math.max(rem, 0), 600) / 10,
  )
}

/** The viewport is at most `width` wide. Narrower breakpoints outrank wider ones. */
export const maxWidth = (width: string): Condition => {
  const rem = widthInRem(width)
  return media(
    `(max-width: ${width})`,
    Rank.maxWidth + (100 - Math.min(Math.max(rem, 0), 100)) / 10.1,
  )
}

/** The user prefers a dark color scheme. */
export const dark: Condition = media('(prefers-color-scheme: dark)', Rank.colorScheme)
/** The user prefers a light color scheme. */
export const light: Condition = media('(prefers-color-scheme: light)', Rank.colorScheme)
/** The user asked for reduced motion. */
export const reducedMotion: Condition = media(
  '(prefers-reduced-motion: reduce)',
  Rank.motion,
)
/** The user has not asked for reduced motion. */
export const motionSafe: Condition = media(
  '(prefers-reduced-motion: no-preference)',
  Rank.motion,
)
/** The user asked for more contrast. */
export const moreContrast: Condition = media('(prefers-contrast: more)', Rank.contrast)
/** The primary pointer can hover. Pair with {@link hover} to skip sticky hover on touch. */
export const canHover: Condition = media('(hover: hover)', Rank.media)
/** The page is being printed. */
export const print: Condition = media('print', Rank.print)

// PSEUDO-ELEMENTS

const PSEUDO_ELEMENT = /^::[a-z-]+$/

/** Retargets declarations to a pseudo-element such as `::before`. */
export const pseudoElement = (name: string): Condition => {
  if (!PSEUDO_ELEMENT.test(name)) {
    throw new Error(
      `[pleat] ${JSON.stringify(name)} is not a pseudo-element such as "::before".`,
    )
  }
  return fromAtoms([pseudoElementAtom(name, Rank.pseudoElement)])
}

/** The element's `::before` box. */
export const before: Condition = pseudoElement('::before')
/** The element's `::after` box. */
export const after: Condition = pseudoElement('::after')
/** An input's placeholder text. */
export const placeholder: Condition = pseudoElement('::placeholder')
/** Selected text inside the element. */
export const selection: Condition = pseudoElement('::selection')
/** A dialog's or full-screen element's backdrop. */
export const backdrop: Condition = pseudoElement('::backdrop')

/** A readable description of a condition, such as `@media (prefers-color-scheme: dark) & :hover`,
 *  or `always`. */
export const label = (condition: Condition): string =>
  isAlways(condition)
    ? 'always'
    : condition.atoms
        .map(atom =>
          atom._tag === 'Selector'
            ? atom.selector
            : atom._tag === 'AtRule'
              ? atom.atRule
              : atom.pseudoElement,
        )
        .join(' & ')

// RENDERING

/** The CSS rule that applies `body` to `.className` under `condition`. */
export const renderRule = (
  condition: Condition,
  className: string,
  body: string,
): string => {
  let selector = `.${className}`
  let pseudoElementSuffix = ''
  const atRules: Array<string> = []
  for (const atom of condition.atoms) {
    if (atom._tag === 'Selector') {
      selector += `:where(${atom.selector})`
    } else if (atom._tag === 'PseudoElement') {
      pseudoElementSuffix += atom.pseudoElement
    } else {
      atRules.push(atom.atRule)
    }
  }
  return atRules.reduceRight(
    (inner, atRule) => `${atRule}{${inner}}`,
    `${selector}${pseudoElementSuffix}{${body}}`,
  )
}
