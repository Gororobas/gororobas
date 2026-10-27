import { Style } from "@pleat/core"
import { type Html, type HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import type { IconConfig } from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { space, tones } from "../theme"

export interface ViewConfig {
  readonly title: string
  readonly icon: (config?: IconConfig) => Html
  /** `h1` when the section is the whole page. */
  readonly element?: "h1" | "h2"
}

const headingStyle = Style.make({ display: "flex", alignItems: "center", gap: space[2] })

export const view = <Message>(
  { title, icon, element = "h2" }: ViewConfig,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(styledAttributes([], headingStyle), [
    icon({
      size: "lg",
      tone: "accent",
      mode: "duotone",
    }),
    AppText.view(
      {
        element,
        appearance: "xl",
        tone: "secondary",
        weight: "semibold",
        lineHeight: "normal",
        styles: [Style.make({ color: tones.secondary.emphasis })],
        children: [title],
      },
      h,
    ),
  ])
