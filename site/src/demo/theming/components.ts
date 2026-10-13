import { Recipe, Style, When } from '@pleat/core'

import { component, semantic } from './tokens.ts'

const {
  color,
  elevation,
  spacing,
  typography,
  shape,
  font,
} = semantic
const { button: buttonToken, badge: badgeToken } =
  component

const focusRing = Style.empty.pipe(
  Style.when(When.focusVisible, {
    outline: `2px solid ${color.focus}`,
    outlineOffset: '2px',
  }),
)

// The root of a scope paints its own surface.
export const scopeRoot = Style.make({
  backgroundColor: color.surface,
  color: color.text,
  fontFamily: font.body,
  fontSize: typography.body,
  lineHeight: 1.5,
})

export const button = Recipe.make({
  name: 'Button',
  base: Style.make({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: buttonToken.paddingY,
    paddingInline: buttonToken.paddingX,
    borderRadius: buttonToken.radius,
    border: '1px solid transparent',
    fontFamily: 'inherit',
    fontSize: typography.label,
    fontWeight: 600,
    lineHeight: 1.25,
    cursor: 'pointer',
  }).pipe(Style.merge(focusRing)),
  variants: {
    tone: {
      Primary: Style.make({
        backgroundColor: color.accent,
        color: color.onAccent,
      }).pipe(
        Style.when(When.hover, {
          backgroundColor: color.accentHover,
        }),
      ),
      Secondary: Style.make({
        backgroundColor: color.surfaceRaised,
        color: color.text,
        borderColor: color.borderStrong,
      }).pipe(
        Style.when(When.hover, {
          backgroundColor: color.surfaceSunken,
        }),
      ),
      Danger: Style.make({
        backgroundColor: color.danger,
        color: color.onDanger,
      }).pipe(
        Style.when(When.hover, {
          backgroundColor: color.dangerHover,
        }),
      ),
    },
  },
  defaults: { tone: 'Secondary' },
})

export const input = Style.make({
  width: '100%',
  paddingBlock: spacing.controlY,
  paddingInline: spacing.controlX,
  borderRadius: shape.control,
  border: `1px solid ${color.borderStrong}`,
  backgroundColor: color.surfaceRaised,
  color: color.text,
  fontFamily: 'inherit',
  fontSize: typography.body,
}).pipe(
  Style.when(When.placeholder, {
    color: color.textMuted,
  }),
  Style.merge(focusRing),
)

export const label = Style.make({
  display: 'grid',
  gap: spacing.controlY,
  fontSize: typography.small,
  fontWeight: 600,
  color: color.textMuted,
})

export const card = Style.make({
  display: 'grid',
  gap: spacing.gap,
  padding: spacing.inset,
  borderRadius: shape.surface,
  border: `1px solid ${color.border}`,
  backgroundColor: color.surfaceRaised,
  boxShadow: elevation.raised,
})

export const cardTitle = Style.make({
  margin: 0,
  fontFamily: font.display,
  fontSize: typography.title,
  fontWeight: 600,
  lineHeight: 1.2,
})

export const cardBody = Style.make({
  margin: 0,
  color: color.textMuted,
})

export const badge = Recipe.make({
  name: 'Badge',
  base: Style.make({
    display: 'inline-flex',
    paddingBlock: 2,
    paddingInline: badgeToken.paddingX,
    borderRadius: badgeToken.radius,
    fontSize: typography.small,
    fontWeight: 600,
  }),
  variants: {
    tone: {
      Neutral: {
        backgroundColor: color.surfaceSunken,
        color: color.textMuted,
      },
      Accent: {
        backgroundColor: color.accentSoft,
        color: color.onAccentSoft,
      },
      Danger: {
        backgroundColor: color.dangerSoft,
        color: color.onDangerSoft,
      },
      Success: {
        backgroundColor: color.successSoft,
        color: color.onSuccessSoft,
      },
    },
  },
  defaults: { tone: 'Neutral' },
})
