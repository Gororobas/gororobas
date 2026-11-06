import { Recipe, Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import type { IconConfig } from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { emptyStateStyle } from "../styles/surfaces"
import { duration, fontSize, fontWeight, radius, space, tones } from "../theme"

const layoutStyle = Recipe.make({
  name: "EmptyStateLayout",
  base: {
    display: "grid",
    justifyItems: "center",
    rowGap: space[2],
    textAlign: "center",
  },
  variants: {
    size: {
      compact: { paddingBlock: space[4] },
      roomy: { paddingBlock: space[10] },
    },
  },
  defaults: { size: "compact" },
})

const iconStyle = Style.make({
  display: "grid",
  placeItems: "center",
  inlineSize: "3rem",
  aspectRatio: "1",
  marginBlockEnd: space[1],
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[300],
})

const titleStyle = Style.make({ color: tones.neutral.shade[900] })
const descriptionStyle = Style.make({ maxInlineSize: "32rem", color: tones.neutral.shade[700] })

const actionStyle = Style.make({
  marginBlockStart: space[2],
  paddingBlock: space[2],
  paddingInline: space[4],
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.accent.shade[100],
  color: tones.accent.shade[800],
  fontSize: fontSize.footnote,
  fontWeight: fontWeight.semibold,
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { backgroundColor: tones.accent.shade[200] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

export type EmptyStateConfig = Readonly<{
  icon: (config?: IconConfig) => Html
  title: string
  /** What the reader can do about it, or why there's nothing yet. */
  maybeDescription?: Option.Option<string>
  maybeAction?: Option.Option<Readonly<{ label: string; href: string }>>
  /** Roomy for a whole page or tab; compact inside a section. */
  size?: "compact" | "roomy"
}>

/** Nothing to show, said kindly: what's missing and, when there's one, the way forward. */
export const view = <Message>(config: EmptyStateConfig, h: HtmlBuilder<Message>): Html => {
  const size = config.size ?? "compact"

  return h.div(styledAttributes([], emptyStateStyle({ size }), layoutStyle({ size })), [
    h.div(styledAttributes([h.AriaHidden(true)], iconStyle), [
      config.icon({ size: "lg", tone: "accent", mode: "duotone" }),
    ]),
    AppText.view(
      {
        element: "p",
        weight: "semibold",
        lineHeight: "tight",
        styles: [titleStyle],
        children: [config.title],
      },
      h,
    ),
    ...EffectArray.fromOption(
      Option.map(config.maybeDescription ?? Option.none(), (description) =>
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            lineHeight: "relaxed",
            styles: [descriptionStyle],
            children: [description],
          },
          h,
        ),
      ),
    ),
    ...EffectArray.fromOption(
      Option.map(config.maybeAction ?? Option.none(), (action) =>
        h.a(styledAttributes([h.Href(action.href)], actionStyle), [action.label]),
      ),
    ),
  ])
}
