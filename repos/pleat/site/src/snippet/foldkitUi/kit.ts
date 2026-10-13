import { Color, Recipe, Style, When } from '@pleat/core'

import { focusRing, tokens } from '../../design.ts'

const { color, font, radius, shadow, space, text } = tokens

// BUTTONS

export const uiButton = Recipe.make({
  name: 'UiButton',
  base: Style.make({
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[2],
    border: '1px solid transparent',
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
  }).pipe(
    Style.merge(focusRing),
    Style.when(When.motionSafe, {
      transition: 'background-color 140ms, border-color 140ms',
    }),
    Style.when(When.active, { translate: '0 1px' }),
    // Foldkit UI sets data-disabled and aria-disabled. Disabled outranks
    // hover and press, so these win whatever else holds.
    Style.when(When.disabled, {
      opacity: 0.5,
      cursor: 'not-allowed',
      translate: 'none',
    }),
  ),
  variants: {
    tone: {
      Primary: Style.make({
        backgroundColor: color.accent,
        color: color.onAccent,
      }).pipe(
        Style.when(When.hover, {
          backgroundColor: Color.darken(color.accent, 0.06),
        }),
      ),
      Neutral: Style.make({
        backgroundColor: color.surface,
        borderColor: color.line,
        color: color.ink,
      }).pipe(
        Style.when(When.hover, { borderColor: color.muted }),
        Style.when(When.open, { borderColor: color.accent }),
      ),
      Quiet: Style.make({
        backgroundColor: 'transparent',
        color: color.ink,
      }).pipe(
        Style.when(When.hover, { backgroundColor: color.sunken }),
      ),
    },
    size: {
      Small: {
        paddingBlock: space[2],
        paddingInline: space[3],
        fontSize: text.sm,
      },
      Medium: {
        paddingBlock: space[3],
        paddingInline: space[4],
        fontSize: text.md,
      },
    },
  },
  defaults: { tone: 'Neutral', size: 'Small' },
})

// TRIGGERS

export const trigger = When.marker('ui-trigger')

export const triggerButton = uiButton({ tone: 'Neutral' }).pipe(
  Style.merge(Style.mark(trigger)),
  Style.merge(
    Style.make({
      justifyContent: 'space-between',
      minWidth: '13rem',
      fontWeight: 500,
    }),
  ),
)

/** Points down, and up while the trigger it sits in is open. */
export const chevron = Style.make({
  width: 7,
  height: 7,
  marginTop: -3,
  borderRight: `1.5px solid ${color.muted}`,
  borderBottom: `1.5px solid ${color.muted}`,
  rotate: '45deg',
  flexShrink: 0,
}).pipe(
  Style.when(When.motionSafe, {
    transition: 'rotate 160ms, margin 160ms',
  }),
  Style.when(When.within(trigger, When.open), {
    rotate: '225deg',
    marginTop: 3,
  }),
)

// FLOATING PANELS

/** Menu, Listbox, and Combobox panels. Foldkit UI positions them inline, so this
 *  leaves position alone and styles the surface and its transition. */
export const panel = Style.make({
  minWidth: 'var(--button-width, 13rem)',
  padding: space[1],
  backgroundColor: color.surface,
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
  boxShadow: shadow.raised,
  outline: 'none',
  zIndex: 30,
  transformOrigin: 'top',
}).pipe(
  // Foldkit UI writes the side it placed the panel on to data-placement.
  Style.when(When.data('placement', 'top'), {
    transformOrigin: 'bottom',
  }),
  // The panel's open look is its base. data-closed holds at the start of
  // entering and the end of leaving, and data-transition holds throughout.
  Style.when(When.all(When.motionSafe, When.transitioning), {
    transition: 'opacity 150ms ease, scale 150ms ease',
  }),
  Style.when(When.closed, { opacity: 0, scale: '0.96' }),
)

// OPTIONS

export const option = When.marker('ui-option')

export const optionItem = Recipe.make({
  name: 'Option',
  base: Style.make({
    display: 'flex',
    alignItems: 'center',
    gap: space[2],
    paddingBlock: space[2],
    paddingInline: space[3],
    borderRadius: 6,
    fontSize: text.sm,
    color: color.ink,
    cursor: 'default',
    userSelect: 'none',
  }).pipe(
    Style.merge(Style.mark(option)),
    // data-active: the item the pointer or the arrow keys are on.
    Style.when(When.highlighted, { backgroundColor: color.sunken }),
    Style.when(When.disabled, { opacity: 0.45 }),
  ),
  variants: {
    tone: {
      Default: Style.empty,
      Danger: Style.make({ color: color.accent }).pipe(
        Style.when(When.highlighted, {
          backgroundColor: color.accentSoft,
        }),
      ),
    },
  },
  defaults: { tone: 'Default' },
})

/** A check mark that shows when the option it sits in is selected. */
export const optionCheck = Style.make({
  width: 5,
  height: 9,
  marginInlineStart: 'auto',
  marginTop: -3,
  borderRight: `2px solid ${color.accent}`,
  borderBottom: `2px solid ${color.accent}`,
  rotate: '45deg',
  opacity: 0,
}).pipe(
  Style.when(When.within(option, When.selected), { opacity: 1 }),
)

export const separator = Style.make({
  height: 1,
  marginBlock: space[1],
  marginInline: space[2],
  backgroundColor: color.line,
})

// FIELDS

export const field = Style.make({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[2],
})

export const fieldLabel = Style.make({
  fontSize: text.sm,
  fontWeight: 600,
  color: color.ink,
})

export const hint = Style.make({
  fontSize: text.xs,
  color: color.muted,
})

export const cluster = Style.make({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space[3],
})

export const column = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  width: '100%',
  maxWidth: '26rem',
})

/** Content that fills a trigger or an option, with its ends pushed apart. */
export const spread = Style.make({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[3],
  width: '100%',
})
