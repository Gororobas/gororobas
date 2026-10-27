import { Recipe, Style, When } from "@pleat/core"
import { css } from "@pleat/foldkit"
import { inertHtml, type Html } from "foldkit/html"

import { appButtonMarker } from "../app-button/styles"
import { space, tones } from "../theme"
import { iconSizeProperty } from "./icon-size"

export type IconTone = "secondary" | "primary" | "accent" | "neutral" | "inherit"

export type IconMode = "outline" | "duotone" | "filled"

export type IconSize = "sm" | "md" | "lg"

export type IconConfig = {
  readonly mode?: IconMode
  readonly tone?: IconTone
  readonly size?: IconSize
  readonly styles?: ReadonlyArray<Style.Style>
}

export type ReiconSvgPaths = {
  readonly duotone: string
  readonly filled: string
  readonly outline: string
}

const sizeStyle = (size: string) => {
  const value = `var(${iconSizeProperty}, ${size})`
  return { inlineSize: value, blockSize: value }
}

const toneStyle = (tone: Exclude<IconTone, "inherit">) => ({ color: tones[tone].ramp[500] })

const iconStyle = Recipe.make({
  name: "Icon",
  base: Style.make({ display: "block", flexShrink: 0 }).pipe(
    // Icons at a button's edges sit into its padding, so the label looks centered.
    Style.when(When.all(When.within(appButtonMarker), When.firstChild), {
      marginInlineStart: `calc(-1 * ${space[1]})`,
    }),
    Style.when(When.all(When.within(appButtonMarker), When.lastChild), {
      marginInlineEnd: `calc(-1 * ${space[1]})`,
    }),
  ),
  variants: {
    size: { sm: sizeStyle("1rem"), md: sizeStyle("1.5rem"), lg: sizeStyle("2rem") },
    tone: {
      inherit: {},
      primary: toneStyle("primary"),
      secondary: toneStyle("secondary"),
      accent: toneStyle("accent"),
      neutral: toneStyle("neutral"),
    },
  },
  defaults: { size: "md", tone: "inherit" },
})

export const reiconGenerator = (svgPaths: ReiconSvgPaths, config: IconConfig = {}): Html => {
  const { mode = "outline", tone = "inherit", size = "md", styles = [] } = config

  return inertHtml.svg([
    inertHtml.AriaHidden(true),
    inertHtml.ViewBox("0 0 24 24"),
    ...css(iconStyle({ size, tone }), ...styles),
    inertHtml.InnerHTML(svgPaths[mode]),
  ])
}
