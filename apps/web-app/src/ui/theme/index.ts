import { Global, Style, When } from "@pleat/core"
import { Record } from "effect"

import {
  colorModeThemes,
  toneContextThemes,
  toneStyle,
  type ColorMode,
  type UserColorTheme,
} from "./color-theme"
import { hortaColorTheme } from "./color-themes/horta"
import { primitivesTheme } from "./primitives"

export {
  toneColors,
  tones,
  toneStyle,
  type ColorMode,
  type Tone,
  type UserColorTheme,
} from "./color-theme"

export {
  borderWidth,
  controlSize,
  duration,
  easing,
  fontFamily,
  fontSize,
  fontWeight,
  layer,
  lineHeight,
  measure,
  mediaBackdrop,
  onScrim,
  radius,
  scrim,
  space,
} from "./primitives"

export { breakpoint } from "./breakpoints"
export { viewport } from "./viewport"

/** Applies a color theme to the page: light by default, dark when the system prefers it, and
 *  the neutral tone as the root tone context. */
export const applyColorTheme = (colorTheme: UserColorTheme): void => {
  const modes = colorModeThemes(colorTheme)
  Global.theme(modes.Light)
  Global.theme(modes.Dark, { when: When.dark })
  Global.theme(toneContextThemes.neutral)
}

Global.theme(primitivesTheme)
applyColorTheme(hortaColorTheme)

const modeThemes = colorModeThemes(hortaColorTheme)
const colorModeStyles: Readonly<Record<ColorMode, Style.Style>> = {
  Light: Style.make({ ...Record.fromEntries(modeThemes.Light.declarations), colorScheme: "light" }),
  Dark: Style.make({ ...Record.fromEntries(modeThemes.Dark.declarations), colorScheme: "dark" }),
}

/** Forces a color mode inside the element, whatever the page follows, with the neutral tone
 *  as its context. Native controls follow too, through `color-scheme`. */
export const colorModeStyle = (mode: ColorMode): Style.Style =>
  Style.merge(colorModeStyles[mode], toneStyle("neutral"))

export { blur, fluidResultCountFontSize } from "./effects"
