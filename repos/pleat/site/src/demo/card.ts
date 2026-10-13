import { Schema } from 'effect'

import { Recipe, Style, When } from '@pleat/core'

import { button, tokens } from '../design.ts'

const { color, radius, space, text } = tokens

// The menu a model chooses from. Every option is compiled before it
// is chosen.
export const surface = Recipe.make({
  name: 'Surface',
  description: 'How a card sits on the page.',
  base: Style.make({
    display: 'grid',
    borderRadius: radius.lg,
    border: '1px solid',
  }),
  variants: {
    tone: {
      Plain: {
        backgroundColor: color.surface,
        color: color.ink,
        borderColor: color.line,
      },
      Accent: {
        backgroundColor: color.accentSoft,
        color: color.ink,
        borderColor: color.accent,
      },
      Inverted: {
        backgroundColor: color.ink,
        color: color.canvas,
        borderColor: color.ink,
      },
    },
    density: {
      Compact: {
        gap: space[2],
        padding: space[4],
        fontSize: text.sm,
      },
      Roomy: {
        gap: space[4],
        padding: space[6],
        fontSize: text.md,
      },
    },
    isFeatured: {
      true: Style.make({
        boxShadow: `0 0 0 3px ${color.accent}`,
      }).pipe(
        Style.when(When.motionSafe, {
          transition: 'box-shadow 200ms ease',
        }),
      ),
      false: Style.empty,
    },
  },
  defaults: { tone: 'Plain', density: 'Roomy', isFeatured: false },
  descriptions: {
    tone:
      'Plain for most cards, Accent to draw attention, ' +
      'Inverted for one hero card.',
    density:
      'Compact in dense grids, Roomy when the card stands alone.',
    isFeatured:
      'Rings the card. Use for at most one card on a screen.',
  },
})

// What the model returns: content, plus props for recipes it may
// use.
export const CardSpec = Schema.Struct({
  title: Schema.String.check(
    Schema.isNonEmpty(),
    Schema.isMaxLength(60),
  ),
  body: Schema.String.check(Schema.isMaxLength(280)),
  surface: surface.schema,
  action: Schema.optionalKey(
    Schema.Struct({
      label: Schema.String.check(
        Schema.isNonEmpty(),
        Schema.isMaxLength(24),
      ),
      tone: button.schema.fields.tone,
    }),
  ),
}).annotate({
  identifier: 'Card',
  description: 'One card in a generated dashboard.',
})

export type CardSpec = typeof CardSpec.Type
