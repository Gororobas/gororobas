import { Style, Theme, Token } from "@pleat/core"
import { Record } from "effect"

const rampSpec = {
  50: Token.color,
  100: Token.color,
  200: Token.color,
  300: Token.color,
  400: Token.color,
  500: Token.color,
  600: Token.color,
  700: Token.color,
  800: Token.color,
  900: Token.color,
  950: Token.color,
}

/** What every tone provides. Views reach for these roles; `shade` and `ramp` are the escape
 *  hatches for a deliberately chosen step. */
const toneColorSpec = {
  /** Keeps its physical meaning in every mode: for marks that stay one color, such as a
   *  pastel tile with dark text on it. */
  ramp: rampSpec,
  /** The ramp mirrored for the current mode: `shade[N]` is `ramp[N]` in light and
   *  `ramp[1000 - N]` in dark, so text and surfaces drawn from it keep their contrast. */
  shade: rampSpec,
  foreground: Token.color,
  foregroundMuted: Token.color,
  /** Saturated text and marks that should stand out from body text: headings, icons. */
  emphasis: Token.color,
  background: Token.color,
  backgroundCard: Token.color,
  backgroundMuted: Token.color,
  border: Token.color,
  borderStrong: Token.color,
  controlBorder: Token.color,
  hover: Token.color,
  pressed: Token.color,
  focus: Token.color,
  /** A saturated wash for surfaces that should read as active, such as an open toolbar. */
  tint: Token.color,
  link: Token.color,
  action: {
    background: Token.color,
    foreground: Token.color,
    hover: Token.color,
    pressed: Token.color,
  },
  selected: {
    background: Token.color,
    foreground: Token.color,
    border: Token.color,
    hover: Token.color,
  },
}

/** Every tone's colors, for the rare place that needs a specific tone without changing the
 *  tone context, such as rich-text links. Prefer {@link toneColors}. */
export const tones = Token.make(
  {
    primary: toneColorSpec,
    secondary: toneColorSpec,
    accent: toneColorSpec,
    neutral: toneColorSpec,
    destructive: toneColorSpec,
  },
  { prefix: "gororobas-" },
)

/** The current tone's colors. Surfaces and controls set the tone context with
 *  {@link toneStyle}; everything inside reads these. */
export const toneColors = Token.make(toneColorSpec, { prefix: "gororobas-tone-" })

export type Tone = keyof typeof tones
export type ColorMode = "Light" | "Dark"

/** A complete color theme: every tone's ramp and roles, per mode. Roles may alias any
 *  tone's ramp, such as primary text drawn from the neutral ramp. */
export interface UserColorTheme {
  readonly light: Theme.Values<typeof tones>
  readonly dark: Theme.Values<typeof tones>
}

export const colorModeThemes = (
  colorTheme: UserColorTheme,
): Readonly<Record<ColorMode, Theme.Theme>> => ({
  Light: Theme.make(tones, colorTheme.light),
  Dark: Theme.make(tones, colorTheme.dark),
})

// NOTE: a tone context aliases one tone's tokens. CSS resolves each alias on the element
// that declares it, so the context follows whichever mode that element inherits.
const toneContextTheme = (tone: Tone): Theme.Theme => Theme.make(toneColors, tones[tone])

export const toneContextThemes: Readonly<Record<Tone, Theme.Theme>> = {
  primary: toneContextTheme("primary"),
  secondary: toneContextTheme("secondary"),
  accent: toneContextTheme("accent"),
  neutral: toneContextTheme("neutral"),
  destructive: toneContextTheme("destructive"),
}

const themeStyle = (theme: Theme.Theme): Style.Style =>
  Style.make(Record.fromEntries(theme.declarations))

const toneStyles: Readonly<Record<Tone, Style.Style>> = Record.map(toneContextThemes, themeStyle)

/** Sets the tone context, so the element and its descendants read `tone` from
 *  {@link toneColors}. Precompiled: one class per declaration, shared across elements. */
export const toneStyle = (tone: Tone): Style.Style => toneStyles[tone]
