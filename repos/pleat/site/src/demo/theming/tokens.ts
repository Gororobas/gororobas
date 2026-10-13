import { Token } from '@pleat/core'

// Every step a color ramp has, light to dark.
export const STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const
export type Step = (typeof STEPS)[number]

// One color token per step. Typed with the color kind, so a theme
// can only alias a ramp step to another color.
type Ramp = { readonly [S in Step]: typeof Token.color }

const ramp = (): Ramp =>
  Object.fromEntries(STEPS.map(step => [step, Token.color])) as Ramp

// PRIMITIVES: the raw palette and scales. The only layer with
// literal values, and no component reads it directly.
export const palette = Token.make(
  {
    white: Token.color,
    black: Token.color,
    gray: ramp(),
    brand: ramp(),
    red: ramp(),
    green: ramp(),
    space: {
      1: Token.length,
      2: Token.length,
      3: Token.length,
      4: Token.length,
      5: Token.length,
      6: Token.length,
    },
    radius: {
      sm: Token.length,
      md: Token.length,
      lg: Token.length,
      full: Token.length,
    },
    size: {
      xs: Token.length,
      sm: Token.length,
      md: Token.length,
      lg: Token.length,
      xl: Token.length,
    },
    typeface: { sans: Token.fontFamily, display: Token.fontFamily },
    shadow: {
      soft: Token.value,
      deep: Token.value,
      flat: Token.value,
    },
  },
  { prefix: 'ds-' },
)

// SEMANTIC: what a value is for. Components read only these, so a
// theme can remap them without touching a component.
export const semantic = Token.make(
  {
    color: {
      surface: Token.color,
      surfaceRaised: Token.color,
      surfaceSunken: Token.color,
      text: Token.color,
      textMuted: Token.color,
      border: Token.color,
      borderStrong: Token.color,
      accent: Token.color,
      accentHover: Token.color,
      onAccent: Token.color,
      accentSoft: Token.color,
      onAccentSoft: Token.color,
      danger: Token.color,
      dangerHover: Token.color,
      onDanger: Token.color,
      dangerSoft: Token.color,
      onDangerSoft: Token.color,
      successSoft: Token.color,
      onSuccessSoft: Token.color,
      focus: Token.color,
    },
    elevation: { raised: Token.value },
    spacing: {
      inset: Token.length,
      gap: Token.length,
      controlX: Token.length,
      controlY: Token.length,
    },
    typography: {
      body: Token.length,
      label: Token.length,
      small: Token.length,
      title: Token.length,
    },
    shape: { control: Token.length, surface: Token.length },
    font: { body: Token.fontFamily, display: Token.fontFamily },
  },
  { prefix: 'ds-' },
)

// COMPONENT: the few knobs one component owns, so all buttons can
// change without every control changing.
export const component = Token.make(
  {
    button: {
      radius: Token.length,
      paddingX: Token.length,
      paddingY: Token.length,
    },
    badge: { radius: Token.length, paddingX: Token.length },
  },
  { prefix: 'ds-' },
)

// The part of the palette a customer may set: their ramp and their
// corners. Everything semantic still comes from the mode.
export const brandKit = {
  brand: palette.brand,
  radius: palette.radius,
}

const { color } = semantic

// Text and the backgrounds it sits on. Every mode must keep each
// pair readable, so a contrast check can walk this list.
export const contrastPairs = [
  { text: color.text, background: color.surface },
  { text: color.text, background: color.surfaceRaised },
  { text: color.text, background: color.surfaceSunken },
  { text: color.textMuted, background: color.surface },
  { text: color.textMuted, background: color.surfaceRaised },
  { text: color.onAccent, background: color.accent },
  { text: color.onAccent, background: color.accentHover },
  { text: color.onAccentSoft, background: color.accentSoft },
  { text: color.onDanger, background: color.danger },
  { text: color.onDanger, background: color.dangerHover },
  { text: color.onDangerSoft, background: color.dangerSoft },
  { text: color.onSuccessSoft, background: color.successSoft },
] as const
