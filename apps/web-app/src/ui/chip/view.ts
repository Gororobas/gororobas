import { Button } from "@foldkit/ui"
import { Recipe, Style, When } from "@pleat/core"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { duration, fontSize, fontWeight, lineHeight, radius, space, tones } from "../theme"

export const chipStyle = Recipe.make({
  name: "Chip",
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: space[1],
    flexShrink: 0,
    paddingBlock: space[1],
    paddingInline: space[3],
    borderRadius: radius.full,
    cornerShape: "squircle",
    fontSize: fontSize.footnote,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.tight,
    whiteSpace: "nowrap",
    textDecoration: "none",
    transitionProperty: "background-color, color",
    transitionDuration: duration.control,
  },
  variants: {
    appearance: {
      /** A value, such as an article's usage. */
      tag: { backgroundColor: tones.primary.ramp[400], color: tones.neutral.ramp[800] },
      /** A choice that narrows a list. */
      option: { backgroundColor: tones.neutral.shade[100], color: tones.neutral.shade[700] },
      selectedOption: { backgroundColor: tones.primary.ramp[400], color: tones.neutral.ramp[900] },
    },
    isInteractive: {
      true: Style.make({ cursor: "pointer", outline: "none" }).pipe(
        Style.when(When.hover, { filter: "brightness(0.96)" }),
        Style.when(When.focusVisible, focusRingDeclarations),
      ),
    },
  },
  defaults: { appearance: "tag", isInteractive: false },
})

export type ChipConfig<Message> = Readonly<{
  label: string
  appearance?: "tag" | "option" | "selectedOption"
  /** Renders a link, such as a filter that changes the URL. */
  href?: string
  onClick?: Message
  /** Makes a clickable chip a toggle, announced as pressed or not, such as a filter option. */
  isPressed?: boolean
  attributes?: ReadonlyArray<Attribute<Message> | ChildAttribute>
}>

export const view = <Message>(config: ChipConfig<Message>, h: HtmlBuilder<Message>): Html => {
  const appearance = config.appearance ?? "tag"
  const isInteractive = config.href !== undefined || config.onClick !== undefined

  const attributes = styledAttributes(
    [
      ...(config.attributes ?? []),
      ...(appearance === "selectedOption" && config.href !== undefined
        ? [h.AriaCurrent("true")]
        : []),
    ],
    chipStyle({ appearance, isInteractive }),
  )

  if (config.href !== undefined) return h.a([h.Href(config.href), ...attributes], [config.label])

  if (config.onClick !== undefined) {
    const pressedAttributes =
      config.isPressed === undefined ? [] : [h.AriaPressed(String(config.isPressed))]

    return Button.view(
      {
        onClick: config.onClick,
        toView: ({ button }) =>
          h.button([...button, ...pressedAttributes, ...attributes], [config.label]),
      },
      h,
    )
  }

  return h.span(attributes, [config.label])
}
