import { Recipe, Style, When } from '@pleat/core'

import { tokens } from './tokens.ts'

const { color, space } = tokens

export const button = Recipe.make({
  name: 'Button',
  base: Style.make({
    display: 'inline-flex',
    gap: space[2],
    borderRadius: 8,
  }).pipe(
    Style.when(When.disabled, {
      opacity: 0.5,
      cursor: 'not-allowed',
    }),
  ),
  variants: {
    tone: {
      Primary: Style.make({
        backgroundColor: color.accent,
        color: color.canvas,
      }),
      Neutral: Style.make({
        backgroundColor: color.canvas,
        color: color.ink,
      }),
    },
    size: {
      Small: { padding: space[2] },
      Medium: { padding: space[4] },
    },
    isPending: { true: { cursor: 'progress' }, false: {} },
  },
  defaults: { tone: 'Neutral', size: 'Medium', isPending: false },
  compounds: [
    {
      when: { tone: 'Primary', isPending: true },
      style: { opacity: 0.8 },
    },
  ],
})

button({ tone: 'Primary' }) // a Style, the same object every time
export const buttonSchema = button.schema // an Effect Schema for the props
