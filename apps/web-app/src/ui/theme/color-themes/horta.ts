import type { Theme } from "@pleat/core"

import { tones, type UserColorTheme } from "../color-theme"

type Ramp = Theme.LiteralValues<typeof tones.primary.ramp>
type RampTokens = typeof tones.primary.ramp
type ToneValues = Theme.Values<typeof tones.primary>

// Horta: warm gold, berry and garden greens from Gororobas.
const gold: Ramp = {
  50: "#fff9ee",
  100: "#fef1d8",
  200: "#fde7bf",
  300: "#f6daa6",
  400: "#f0d095",
  500: "#d8b05c",
  600: "#b88f2e",
  700: "#926c16",
  800: "#694b0d",
  900: "#4a3208",
  950: "#2f1f05",
}

const berry: Ramp = {
  50: "#fbf2f4",
  100: "#f6e1e6",
  200: "#f0c6d1",
  300: "#e7a6b9",
  400: "#db819d",
  500: "#c55a7c",
  600: "#a8325d",
  700: "#8e254e",
  800: "#721c3e",
  900: "#54132d",
  950: "#3b0c1f",
}

const rose: Ramp = {
  50: "#fcf8f7",
  100: "#f5e9e7",
  200: "#ead4d3",
  300: "#d8b5b7",
  400: "#bd9197",
  500: "#9f6c78",
  600: "#85515f",
  700: "#6f3e4d",
  800: "#59303e",
  900: "#432231",
  950: "#2a111c",
}

const sage: Ramp = {
  50: "#f7f6e9",
  100: "#f0efd6",
  200: "#e0e0b3",
  300: "#ccd08f",
  400: "#aebb72",
  500: "#839d58",
  600: "#2e8581",
  700: "#246e6a",
  800: "#1c5753",
  900: "#13403d",
  950: "#0c2b28",
}

const red: Ramp = {
  50: "oklch(97.1% 0.013 17.38)",
  100: "oklch(93.6% 0.032 17.717)",
  200: "oklch(88.5% 0.062 18.334)",
  300: "oklch(80.8% 0.114 19.571)",
  400: "oklch(70.4% 0.191 22.216)",
  500: "oklch(63.7% 0.237 25.331)",
  600: "oklch(57.7% 0.245 27.325)",
  700: "oklch(50.5% 0.213 27.518)",
  800: "oklch(44.4% 0.177 26.899)",
  900: "oklch(39.6% 0.141 25.723)",
  950: "oklch(25.8% 0.092 26.042)",
}

// Light and dark mirror each other around 500: a role that sits on shade N in light sits
// on shade 1000 - N in dark.
const lightShades = (shade: RampTokens): ToneValues["shade"] => ({
  50: shade[50],
  100: shade[100],
  200: shade[200],
  300: shade[300],
  400: shade[400],
  500: shade[500],
  600: shade[600],
  700: shade[700],
  800: shade[800],
  900: shade[900],
  950: shade[950],
})

const darkShades = (shade: RampTokens): ToneValues["shade"] => ({
  50: shade[950],
  100: shade[900],
  200: shade[800],
  300: shade[700],
  400: shade[600],
  500: shade[500],
  600: shade[400],
  700: shade[300],
  800: shade[200],
  900: shade[100],
  950: shade[50],
})

const lightRoles = (ramp: Ramp, shade: RampTokens): ToneValues => ({
  ramp,
  shade: lightShades(shade),
  foreground: shade[950],
  foregroundMuted: shade[700],
  emphasis: shade[600],
  background: shade[100],
  backgroundCard: shade[50],
  backgroundMuted: shade[200],
  border: shade[200],
  borderStrong: shade[300],
  controlBorder: shade[700],
  hover: shade[200],
  pressed: shade[300],
  // Focus rings need 3:1 against every surface (WCAG 1.4.11); 700 is the lightest shade that
  // clears it in every tone.
  focus: shade[700],
  tint: shade[400],
  link: shade[700],
  action: { background: shade[700], foreground: shade[50], hover: shade[800], pressed: shade[900] },
  selected: {
    background: shade[200],
    foreground: shade[950],
    border: shade[700],
    hover: shade[300],
  },
})

const darkRoles = (ramp: Ramp, shade: RampTokens): ToneValues => ({
  ramp,
  shade: darkShades(shade),
  foreground: shade[50],
  foregroundMuted: shade[300],
  emphasis: shade[400],
  background: shade[900],
  backgroundCard: shade[950],
  backgroundMuted: shade[800],
  border: shade[800],
  borderStrong: shade[700],
  controlBorder: shade[300],
  hover: shade[800],
  pressed: shade[700],
  focus: shade[300],
  tint: shade[600],
  link: shade[300],
  action: {
    background: shade[300],
    foreground: shade[950],
    hover: shade[200],
    pressed: shade[100],
  },
  selected: {
    background: shade[800],
    foreground: shade[50],
    border: shade[300],
    hover: shade[700],
  },
})

export const hortaColorTheme: UserColorTheme = {
  light: {
    primary: {
      ...lightRoles(gold, tones.primary.ramp),
      // Primary surfaces keep neutral body text; gold is for actions, marks and metadata.
      foreground: tones.neutral.ramp[950],
      selected: lightRoles(sage, tones.accent.ramp).selected,
    },
    secondary: lightRoles(berry, tones.secondary.ramp),
    accent: lightRoles(sage, tones.accent.ramp),
    // The page sits on a warm peach rather than the rose tint.
    neutral: { ...lightRoles(rose, tones.neutral.ramp), background: "#fdeadd" },
    destructive: lightRoles(red, tones.destructive.ramp),
  },
  dark: {
    primary: {
      ...darkRoles(gold, tones.primary.ramp),
      foreground: tones.neutral.ramp[50],
      selected: darkRoles(sage, tones.accent.ramp).selected,
    },
    secondary: darkRoles(berry, tones.secondary.ramp),
    accent: darkRoles(sage, tones.accent.ramp),
    neutral: darkRoles(rose, tones.neutral.ramp),
    destructive: darkRoles(red, tones.destructive.ramp),
  },
}
