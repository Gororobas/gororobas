/** Pleat styles in Foldkit views.
 *
 *  ```ts
 *  import { css } from '@pleat/foldkit'
 *
 *  h.button([...attributes.button, ...css(button({ tone: 'Primary' }))], ['Save'])
 *  ```
 *
 *  For APIs that take a class name instead of attributes, such as the `className` fields of
 *  `@foldkit/ui`'s Menu, Listbox, and Combobox, use {@link cssClass}.
 *
 *  @packageDocumentation */

import { type Attribute, inertHtml } from 'foldkit/html'

import { Style, Var } from '@pleat/core'

// PARTS

/** A plain class name passed through untouched, for CSS Pleat doesn't own (a Tailwind
 *  utility, a third-party widget's class). */
export interface ClassName {
  readonly _tag: 'ClassName'
  readonly value: string
}

// NOTE: a class attribute separates tokens with ASCII whitespace only, so only that splits.
const ASCII_WHITESPACE = /[\t\n\f\r ]+/
const WHITESPACE_OR_CONTROL = /[\s\p{Cc}]/u

/** Wraps class names Pleat doesn't own so {@link css} can put them on the element too.
 *
 *  Any HTML class token passes, including Tailwind's arbitrary values and variants, such as
 *  `w-[calc(100%-1rem)]`, `data-[state=open]:block`, and `text-red-500!`. Tokens are
 *  separated by ASCII whitespace, as in a class attribute. A token that contains other
 *  whitespace or a control character throws. Foldkit escapes the attribute when it renders,
 *  so a token can't break out of it. */
export const className = (value: string): ClassName => {
  const tokens = value.split(ASCII_WHITESPACE).filter(token => token !== '')
  for (const token of tokens) {
    if (WHITESPACE_OR_CONTROL.test(token)) {
      throw new Error(
        `[pleat] ${JSON.stringify(token)} is not a class name: it contains whitespace or a control character.`,
      )
    }
  }
  return { _tag: 'ClassName', value: tokens.join(' ') }
}

/** The attributes {@link css} produces: a `Class` and a `Style`. They carry no Message, so
 *  they fit any element, including ones that refuse other attributes, like `textarea`. */
export type CssAttribute = Extract<
  Attribute<never>,
  Readonly<{ _tag: 'Class' | 'Style' }>
>

/** Anything {@link css} accepts. */
export type Part = Style.Style | Var.Binding | ClassName

const isClassName = (part: Part): part is ClassName =>
  '_tag' in part && part._tag === 'ClassName'

// ATTRIBUTES

const NO_ATTRIBUTES: ReadonlyArray<CssAttribute> = Object.freeze([])

const attributesByStyle = new WeakMap<Style.Style, ReadonlyArray<CssAttribute>>()

const attributesFor = (style: Style.Style): ReadonlyArray<CssAttribute> => {
  const cached = attributesByStyle.get(style)
  if (cached !== undefined) {
    return cached
  }
  const className = Style.use(style)
  const attributes =
    className === '' ? NO_ATTRIBUTES : Object.freeze([inertHtml.Class(className)])
  attributesByStyle.set(style, attributes)
  return attributes
}

/** The attributes that apply Pleat styles to an element: one `Class` with every style's
 *  atoms, merged left to right, and one `Style` with every variable binding. Spread them
 *  into the element's attributes.
 *
 *  Foldkit keeps only the last `Class` and the last `Style` an element is given, so pass
 *  everything to one `css` call rather than spreading several.
 *
 *  For a single style, or styles already merged before, the result is cached and the call
 *  allocates nothing. The first use of a style in a browser inserts its rules.
 *
 *  ```ts
 *  h.div([...css(card, isSelected ? selectedRing : Style.empty)], children)
 *  h.div([...css(progressBar, Var.bind(progress, model.percent))])
 *  ``` */
export const css = (...parts: ReadonlyArray<Part>): ReadonlyArray<CssAttribute> => {
  if (parts.length === 1) {
    const [only] = parts
    if (only !== undefined && Style.isStyle(only)) {
      return attributesFor(only)
    }
  }

  let style = Style.empty
  let extraClasses = ''
  let bindings: Record<string, string> | undefined
  for (const part of parts) {
    if (Style.isStyle(part)) {
      style = Style.merge(style, part)
    } else if (Var.isBinding(part)) {
      bindings ??= {}
      bindings[part.name] = part.value
    } else if (isClassName(part)) {
      extraClasses = extraClasses === '' ? part.value : `${extraClasses} ${part.value}`
    }
  }

  if (bindings === undefined && extraClasses === '') {
    return attributesFor(style)
  }

  const styleClasses = Style.use(style)
  const classes =
    styleClasses === ''
      ? extraClasses
      : extraClasses === ''
        ? styleClasses
        : `${styleClasses} ${extraClasses}`
  const attributes: Array<CssAttribute> = []
  if (classes !== '') {
    attributes.push(inertHtml.Class(classes))
  }
  if (bindings !== undefined) {
    attributes.push(inertHtml.Style(bindings))
  }
  return attributes
}

// CLASS NAMES

/** The class names that apply Pleat styles, as one string, for APIs that take a class name
 *  rather than attributes. `@foldkit/ui`'s Menu, Listbox, and Combobox are the main case:
 *  their parts take `buttonClassName`, `itemsClassName`, and an item's `className`, and an
 *  item has no field for attributes at all.
 *
 *  Styles merge left to right, the same as in {@link css}. A variable binding needs an inline
 *  style, which a class name can't carry, so pass bindings to {@link css} on an element you
 *  render yourself.
 *
 *  ```ts
 *  itemToConfig: item => ({ className: cssClass(menuItem), content: h.span([], [item]) })
 *  ``` */
export const cssClass = (...parts: ReadonlyArray<Style.Style | ClassName>): string => {
  let style = Style.empty
  let extraClasses = ''
  for (const part of parts) {
    if (Style.isStyle(part)) {
      style = Style.merge(style, part)
    } else {
      extraClasses = extraClasses === '' ? part.value : `${extraClasses} ${part.value}`
    }
  }
  const styleClasses = Style.use(style)
  return styleClasses === ''
    ? extraClasses
    : extraClasses === ''
      ? styleClasses
      : `${styleClasses} ${extraClasses}`
}
