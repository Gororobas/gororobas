import { Option } from 'effect'

import { Calc, Color, Recipe, Style } from '@pleat/core'

// Transforms are functions from style to style. They compile to
// CSS functions, so they hold under every theme.
const bumpFontSize = Style.evolve({
  fontSize: size => Calc.add(size, 4),
})
const darkenText = Style.evolve({
  color: color => Color.darken(color, 0.1),
})
const withBrandFont = Style.merge(
  Style.make({ fontFamily: '"Instrument Serif", serif' }),
)
const raised = Style.make({
  boxShadow: '0 2px 3px rgb(0 0 0 / 0.25)',
})

// An outline derived from a finished style. Props never reach it;
// they only pick which finished branch applies.
const outlined = (style: Style.Style) =>
  Style.make({
    border: '1px solid currentColor',
    backgroundColor: 'transparent',
    color: Option.getOrElse(
      Style.get(style, 'backgroundColor'),
      () => 'inherit',
    ),
  })

const primary = Style.make({ backgroundColor: 'green' })
const secondary = Style.make({ backgroundColor: 'blue' })

export const myButton = Recipe.make({
  base: Style.make({
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  }).pipe(
    bumpFontSize,
    darkenText,
    withBrandFont,
    Style.merge(raised),
  ),
  variants: {
    isPrimary: { true: primary, false: secondary },
    isOutline: { true: {}, false: {} },
  },
  defaults: { isPrimary: false, isOutline: false },
  compounds: [
    {
      when: { isPrimary: true, isOutline: true },
      style: outlined(primary),
    },
    {
      when: { isPrimary: false, isOutline: true },
      style: outlined(secondary),
    },
  ],
})

myButton({ isPrimary: false, isOutline: true })
