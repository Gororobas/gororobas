import { Schema } from 'effect'

import { isSafeValue } from './property.ts'
import { type Ref, isRef, makeRef } from './var.ts'

// KINDS

const safe = Schema.makeFilter((value: string) =>
  isSafeValue(value)
    ? undefined
    : 'Expected a CSS value without ; { } < ! comments or unbalanced brackets',
)

// NOTE: the named and system colors of CSS Color 4, spelled the way they are
// written. A pattern with the `i` flag can't be exported to JSON Schema, so
// the casings are listed instead.
const NAMED_COLORS = [
  ...'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent currentcolor currentColor'.split(
    ' ',
  ),
  ...'AccentColor AccentColorText ActiveText ButtonBorder ButtonFace ButtonText Canvas CanvasText Field FieldText GrayText Highlight HighlightText LinkText Mark MarkText SelectedItem SelectedItemText VisitedText'
    .split(' ')
    .flatMap(name => [name, name.toLowerCase()]),
]

const COLOR = new RegExp(
  '^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|' +
    `(${NAMED_COLORS.join('|')})|` +
    '(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\\([^;{}<>!]*\\))$',
)
const LENGTH =
  /^(0|-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|svh|lvh|dvh|ch|ex|lh|cqi|cqb)|(calc|clamp|min|max|var)\([^;{}<>!]*\))$/
const DURATION = /^(\d*\.?\d+(ms|s)|var\([^;{}<>!]*\))$/
const FONT_FAMILY = /^[A-Za-z0-9 ,"'_.-]+$|^var\([^;{}<>!]*\)$/

// NOTE: `expected` names the kind in decode errors, which would otherwise print the pattern.
const patterned = (pattern: RegExp, title: string, description: string) =>
  Schema.String.check(
    Schema.isPattern(pattern, {
      expected: description.charAt(0).toLowerCase() + description.slice(1, -1),
    }),
    safe,
  ).annotate({ title, description })

/** What kind of value a token holds. The kind's schema validates theme values and describes
 *  them to language models. Its name tells kinds apart, in types too, so a theme can only
 *  alias a token to another token of the same kind. */
export interface Kind<
  A extends string | number = string | number,
  N extends string = string,
> {
  readonly _tag: 'Kind'
  readonly name: N
  readonly schema: Schema.Codec<A>
}

const kind = <A extends string | number, N extends string>(
  name: N,
  schema: Schema.Codec<A>,
): Kind<A, N> => ({ _tag: 'Kind', name, schema })

/** A color: hex with 3, 4, 6, or 8 digits, a named or system color, or a color function
 *  such as `oklch(…)` or `color-mix(…)`. The check is a shape check: it doesn't parse a
 *  function's arguments, so the browser still drops `rgb(nope)`. */
export const color: Kind<string, 'Color'> = kind(
  'Color',
  patterned(COLOR, 'Color', 'A CSS color, such as #1d4ed8 or oklch(62% 0.19 255).'),
)

/** A length such as `1rem`, `12px`, or `clamp(…)`. */
export const length: Kind<string, 'Length'> = kind(
  'Length',
  patterned(LENGTH, 'Length', 'A CSS length, such as 0.75rem or 12px.'),
)

/** A duration such as `150ms`. */
export const duration: Kind<string, 'Duration'> = kind(
  'Duration',
  patterned(DURATION, 'Duration', 'A CSS duration, such as 150ms.'),
)

/** A font stack such as `"Inter", system-ui, sans-serif`. */
export const fontFamily: Kind<string, 'FontFamily'> = kind(
  'FontFamily',
  patterned(
    FONT_FAMILY,
    'Font family',
    'A CSS font stack, such as "Inter", system-ui, sans-serif.',
  ),
)

/** A unitless number such as a font weight, line height, or opacity. */
export const number: Kind<number, 'Number'> = kind(
  'Number',
  Schema.Finite.annotate({ title: 'Number', description: 'A unitless number.' }),
)

/** Any other CSS value: a shadow, an easing curve, a gradient. A token of this kind can alias
 *  a token of any kind. */
export const value: Kind<string, 'Value'> = kind(
  'Value',
  Schema.String.check(safe).annotate({ title: 'Value', description: 'A CSS value.' }),
)

// TOKENS

/** A design token: a named custom property with a kind. Use it anywhere a value goes. */
export interface Token<
  A extends string | number = string | number,
  N extends string = string,
> extends Ref {
  readonly kind: Kind<A, N>
  /** The token's path in its tree, such as `['color', 'ink']`. */
  readonly path: ReadonlyArray<string>
}

/** Whether `value` is a {@link Token}. */
export const isToken = (value: unknown): value is Token =>
  isRef(value) && 'kind' in value && 'path' in value

/** A tree of kinds, the shape of a design system's tokens. */
export type Spec = Kind | { readonly [key: string]: Spec }

/** The tokens for a spec: the same tree with tokens at the leaves. */
export type Tokens<S extends Spec> =
  S extends Kind<infer A, infer N>
    ? Token<A, N>
    : { readonly [K in keyof S]: S[K] extends Spec ? Tokens<S[K]> : never }

const isKind = (spec: Spec): spec is Kind => '_tag' in spec && spec._tag === 'Kind'

const SEGMENT = /^[A-Za-z0-9]+$/

const segmentName = (segment: string): string => {
  if (!SEGMENT.test(segment)) {
    throw new Error(
      `[pleat] Token key ${JSON.stringify(segment)} must be letters and digits, such as onAccent or 2.`,
    )
  }
  return segment.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

/** Creates tokens from a spec. Each leaf becomes `--<prefix><path>`: with no prefix,
 *  `color.onAccent` is `--color-on-accent`. Throws when two paths make the same name, such
 *  as `fooBar` and `foo.bar`. Separate trees can still share names; {@link Theme.merge}
 *  catches that, and a `prefix` per tree avoids it.
 *
 *  ```ts
 *  const tokens = Token.make({
 *    color: { canvas: Token.color, ink: Token.color, accent: Token.color },
 *    space: { 1: Token.length, 2: Token.length, 3: Token.length },
 *    font: { body: Token.fontFamily },
 *  })
 *  ``` */
export const make = <const S extends Spec>(
  spec: S,
  options: Readonly<{ prefix?: string }> = {},
): Tokens<S> => build(spec, [], options.prefix ?? '', new Map()) as Tokens<S>

const build = (
  spec: Spec,
  path: ReadonlyArray<string>,
  prefix: string,
  named: Map<string, ReadonlyArray<string>>,
): unknown => {
  if (isKind(spec)) {
    const name = `--${prefix}${path.map(segmentName).join('-')}`
    const existing = named.get(name)
    if (existing !== undefined) {
      throw new Error(
        `[pleat] Token paths ${existing.join('.')} and ${path.join('.')} both name ${name}. ` +
          'Rename one of them.',
      )
    }
    named.set(name, path)
    return makeRef(name, { kind: spec, path })
  }
  return Object.fromEntries(
    Object.entries(spec).map(([key, child]) => [
      key,
      build(child, [...path, key], prefix, named),
    ]),
  )
}

/** Every token in a tree, depth first. */
export const leaves = (tokens: object): ReadonlyArray<Token> =>
  isToken(tokens)
    ? [tokens]
    : Object.values(tokens).flatMap(child =>
        typeof child === 'object' && child !== null ? leaves(child) : [],
      )
