import { Recipe, Style, When } from '@pleat/core'

// The same components with the values written in
// place. They look identical until the design changes.

const focusRing = Style.empty.pipe(
  Style.when(When.focusVisible, {
    outline: '2px solid #4a81eb',
    outlineOffset: '2px',
  }),
)

export const scopeRoot = Style.make({
  backgroundColor: '#f6f7f8',
  color: '#282c31',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontSize: 15,
  lineHeight: 1.5,
})

export const button = Recipe.make({
  name: 'Button',
  base: Style.make({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: 12,
    paddingInline: 16,
    borderRadius: 6,
    border: '1px solid transparent',
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.25,
    cursor: 'pointer',
  }).pipe(Style.merge(focusRing)),
  variants: {
    tone: {
      Primary: Style.make({
        backgroundColor: '#3368d0',
        color: '#ffffff',
      }).pipe(
        Style.when(When.hover, {
          backgroundColor: '#2452ac',
        }),
      ),
      Secondary: Style.make({
        backgroundColor: '#ffffff',
        color: '#282c31',
        borderColor: '#9ca2ac',
      }).pipe(
        Style.when(When.hover, {
          backgroundColor: '#ebedef',
        }),
      ),
      Danger: Style.make({
        backgroundColor: '#c52b30',
        color: '#ffffff',
      }).pipe(
        Style.when(When.hover, {
          backgroundColor: '#a21820',
        }),
      ),
    },
  },
  defaults: { tone: 'Secondary' },
})

export const input = Style.make({
  width: '100%',
  paddingBlock: 12,
  paddingInline: 16,
  borderRadius: 6,
  border: '1px solid #9ca2ac',
  backgroundColor: '#ffffff',
  color: '#282c31',
  fontFamily: 'inherit',
  fontSize: 15,
}).pipe(
  Style.when(When.placeholder, { color: '#686f7b' }),
  Style.merge(focusRing),
)

export const label = Style.make({
  display: 'grid',
  gap: 12,
  fontSize: 13,
  fontWeight: 600,
  color: '#686f7b',
})

export const card = Style.make({
  display: 'grid',
  gap: 16,
  padding: 24,
  borderRadius: 10,
  border: '1px solid #d8dbdf',
  backgroundColor: '#ffffff',
  boxShadow:
    '0 1px 2px rgb(30 35 45 / 0.08), ' +
    '0 10px 24px -14px rgb(30 35 45 / 0.3)',
})

export const cardTitle = Style.make({
  margin: 0,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1.2,
})

export const cardBody = Style.make({
  margin: 0,
  color: '#686f7b',
})

export const badge = Recipe.make({
  name: 'Badge',
  base: Style.make({
    display: 'inline-flex',
    paddingBlock: 2,
    paddingInline: 8,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
  }),
  variants: {
    tone: {
      Neutral: {
        backgroundColor: '#ebedef',
        color: '#686f7b',
      },
      Accent: {
        backgroundColor: '#e2edff',
        color: '#193d85',
      },
      Danger: {
        backgroundColor: '#ffe5e1',
        color: '#7d0f16',
      },
      Success: {
        backgroundColor: '#e3f1e5',
        color: '#0b5024',
      },
    },
  },
  defaults: { tone: 'Neutral' },
})
