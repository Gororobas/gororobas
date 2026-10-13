import { Global, Theme } from '@pleat/core'

import {
  STEPS,
  type Step,
  component,
  palette,
  semantic,
} from './tokens.ts'

const { white, black, gray, brand, red, green } = palette
const { space, radius, size, typeface, shadow } = palette

// PRIMITIVE VALUES

// Lightness and a share of the ramp's chroma for each step. Chroma
// eases off toward white and black so every step stays in gamut.
const STOPS: Readonly<Record<Step, readonly [number, number]>> = {
  50: [97.5, 0.06],
  100: [94.5, 0.14],
  200: [89, 0.3],
  300: [81, 0.55],
  400: [71, 0.8],
  500: [62, 1],
  600: [54, 1],
  700: [46, 0.9],
  800: [38, 0.75],
  900: [29, 0.6],
  950: [21, 0.45],
}

// One hue and chroma make a whole ramp.
export const shades = (hue: number, chroma: number) =>
  Object.fromEntries(
    STEPS.map(step => {
      const [lightness, share] = STOPS[step]
      const c = (chroma * share).toFixed(3)
      return [step, `oklch(${lightness}% ${c} ${hue})`]
    }),
  ) as Readonly<Record<Step, string>>

// BRANDS: values for the primitives. A brand is a palette.

export const harbor = Theme.make(palette, {
  white: 'oklch(100% 0 0)',
  black: 'oklch(14% 0.01 260)',
  gray: shades(260, 0.02),
  brand: shades(262, 0.17),
  red: shades(25, 0.19),
  green: shades(150, 0.13),
  space: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.5rem',
    6: '2rem',
  },
  radius: { sm: '4px', md: '6px', lg: '10px', full: '999px' },
  size: {
    xs: '0.75rem',
    sm: '0.8125rem',
    md: '0.9375rem',
    lg: '1.125rem',
    xl: '1.375rem',
  },
  typeface: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    display: 'ui-sans-serif, system-ui, sans-serif',
  },
  shadow: {
    soft: '0 1px 2px oklch(20% 0.02 260 / 0.08), 0 10px 24px -14px oklch(20% 0.02 260 / 0.3)',
    deep: '0 1px 0 oklch(100% 0 0 / 0.04) inset, 0 12px 28px -12px oklch(0% 0 0 / 0.7)',
    flat: 'none',
  },
})

// A second brand overrides only what makes it different: its hue,
// rounder corners, and a serif for titles.
export const orchard = Theme.extend(harbor, palette, {
  brand: shades(345, 0.15),
  radius: { sm: '8px', md: '12px', lg: '20px' },
  typeface: {
    display: '"Iowan Old Style", Palatino, Georgia, serif',
  },
})

// MODES: semantic colors, as aliases into the palette.

const mode = {
  color: semantic.color,
  elevation: semantic.elevation,
}

export const light = Theme.make(mode, {
  color: {
    surface: gray[50],
    surfaceRaised: white,
    surfaceSunken: gray[100],
    text: gray[900],
    textMuted: gray[600],
    border: gray[200],
    borderStrong: gray[400],
    accent: brand[600],
    accentHover: brand[700],
    onAccent: white,
    accentSoft: brand[100],
    onAccentSoft: brand[800],
    danger: red[600],
    dangerHover: red[700],
    onDanger: white,
    dangerSoft: red[100],
    onDangerSoft: red[800],
    successSoft: green[100],
    onSuccessSoft: green[800],
    focus: brand[500],
  },
  elevation: { raised: shadow.soft },
})

export const dark = Theme.extend(light, mode, {
  color: {
    surface: gray[950],
    surfaceRaised: gray[900],
    surfaceSunken: black,
    text: gray[50],
    textMuted: gray[400],
    border: gray[800],
    borderStrong: gray[600],
    accent: brand[400],
    accentHover: brand[300],
    onAccent: black,
    accentSoft: brand[900],
    onAccentSoft: brand[200],
    danger: red[400],
    dangerHover: red[300],
    onDanger: black,
    dangerSoft: red[900],
    onDangerSoft: red[200],
    successSoft: green[900],
    onSuccessSoft: green[200],
    focus: brand[400],
  },
  elevation: { raised: shadow.deep },
})

// High contrast starts from light and pushes text, borders, and
// accents to the ends of their ramps.
export const highContrast = Theme.extend(light, mode, {
  color: {
    surface: white,
    surfaceSunken: gray[50],
    text: black,
    textMuted: gray[800],
    border: gray[900],
    borderStrong: black,
    accent: brand[800],
    accentHover: brand[950],
    onAccentSoft: brand[950],
    danger: red[800],
    dangerHover: red[950],
    onDangerSoft: red[950],
    onSuccessSoft: green[950],
    focus: black,
  },
  elevation: { raised: shadow.flat },
})

// DENSITIES: semantic spacing and type, as aliases into the scales.

const density = {
  spacing: semantic.spacing,
  typography: semantic.typography,
}

export const comfortable = Theme.make(density, {
  spacing: {
    inset: space[5],
    gap: space[4],
    controlX: space[4],
    controlY: space[3],
  },
  typography: {
    body: size.md,
    label: size.md,
    small: size.sm,
    title: size.xl,
  },
})

export const compact = Theme.extend(comfortable, density, {
  spacing: {
    inset: space[4],
    gap: space[2],
    controlX: space[3],
    controlY: space[2],
  },
  typography: { body: size.sm, label: size.sm, small: size.xs },
})

// SYSTEM: aliases that never change between themes.

export const system = Theme.make(
  { shape: semantic.shape, font: semantic.font, ...component },
  {
    shape: { control: radius.md, surface: radius.lg },
    font: { body: typeface.sans, display: typeface.display },
    button: {
      radius: semantic.shape.control,
      paddingX: semantic.spacing.controlX,
      paddingY: semantic.spacing.controlY,
    },
    badge: { radius: radius.full, paddingX: space[2] },
  },
)

// Each axis is one attribute on a scope's root element.
Global.theme(system, { selector: '[data-ds-mode]' })
Global.theme(harbor, { selector: '[data-ds-brand="Harbor"]' })
Global.theme(orchard, { selector: '[data-ds-brand="Orchard"]' })
Global.theme(light, { selector: '[data-ds-mode="Light"]' })
Global.theme(dark, { selector: '[data-ds-mode="Dark"]' })
Global.theme(highContrast, {
  selector: '[data-ds-mode="HighContrast"]',
})
Global.theme(comfortable, {
  selector: '[data-ds-density="Comfortable"]',
})
Global.theme(compact, { selector: '[data-ds-density="Compact"]' })
