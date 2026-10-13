import { Calc, Color, Style, When } from '@pleat/core'

import { tokens } from './tokens.ts'

const { color, space } = tokens

// A style is a value. Later declarations win, like object spread.
export const link = Style.make({
  color: color.ink,
  textUnderlineOffset: '0.2em',
}).pipe(
  Style.when(When.hover, { color: color.accent }),
  Style.when(When.focusVisible, {
    outline: `2px solid ${color.accent}`,
  }),
)

// Inside a hovered element marked `row`, and for @foldkit/ui's
// data-selected state.
export const row = When.marker('row')
export const rowLabel = Style.make({ color: color.ink }).pipe(
  Style.when(When.within(row, When.hover), { color: color.accent }),
  Style.when(When.selected, { fontWeight: 600 }),
)

// Transforms run once, where the style is defined, and compile to
// CSS functions, so they still hold after a theme changes the
// tokens underneath them.
const bumpFontSize = Style.evolve({
  fontSize: size => Calc.add(size, 2),
})
const darkenText = Style.evolve({
  color: value => Color.darken(value, 0.08),
})

export const caption = Style.make({
  fontSize: 13,
  color: color.accent,
  padding: space[2],
}).pipe(bumpFontSize, darkenText)
