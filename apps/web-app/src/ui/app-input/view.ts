import { Style, When } from "@pleat/core"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import { styledAttributes } from "../pleat-attributes"
import {
  borderWidth,
  controlSize,
  duration,
  fontSize,
  lineHeight,
  radius,
  space,
  toneColors,
  tones,
} from "../theme"

/** The look every text control shares: a bordered well on the page background. */
export const textControlStyle = Style.make({
  display: "block",
  inlineSize: "100%",
  minInlineSize: 0,
  paddingInline: space[3],
  paddingBlock: space[2],
  borderWidth: borderWidth.hairline,
  borderStyle: "solid",
  borderColor: toneColors.border,
  borderRadius: radius.md,
  backgroundColor: toneColors.background,
  color: toneColors.foreground,
  fontSize: fontSize.regular,
  lineHeight: lineHeight.normal,
  outline: "none",
  transitionProperty: "border-color, background-color, outline-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.placeholder, { color: toneColors.foregroundMuted, opacity: 1 }),
  Style.when(When.focusVisible, {
    outline: `${borderWidth.strong} solid ${toneColors.focus}`,
    outlineOffset: 0,
  }),
  Style.when(When.invalid, { borderColor: tones.destructive.emphasis }),
  Style.when(When.disabled, { opacity: 0.5, cursor: "not-allowed" }),
)

const inputStyle = Style.make({ minBlockSize: controlSize.lg })
const prefixedInputStyle = Style.make({ paddingInlineStart: space[7] })
const prefixWrapperStyle = Style.make({ position: "relative" })

const prefixStyle = Style.make({
  position: "absolute",
  insetBlock: 0,
  insetInlineStart: space[3],
  display: "flex",
  alignItems: "center",
  pointerEvents: "none",
})

export interface AppInputConfig<Message> {
  /** The input's attributes, such as the ones `@foldkit/ui`'s Input gives `toView`. */
  readonly attributes: ReadonlyArray<Attribute<Message> | ChildAttribute>
  /** Fixed text shown before the value, such as `@` for handles. */
  readonly prefix?: string
  readonly styles?: ReadonlyArray<Style.Style>
}

/** A single-line text control. */
export const view = <Message>(config: AppInputConfig<Message>, h: HtmlBuilder<Message>): Html => {
  const input = h.input(
    styledAttributes(
      config.attributes,
      textControlStyle,
      inputStyle,
      ...(config.prefix === undefined ? [] : [prefixedInputStyle]),
      ...(config.styles ?? []),
    ),
  )

  return config.prefix === undefined
    ? input
    : h.div(styledAttributes([], prefixWrapperStyle), [
        AppText.view(
          {
            element: "span",
            appearance: "footnote",
            isMuted: true,
            attributes: [h.AriaHidden(true)],
            styles: [prefixStyle],
            children: [config.prefix],
          },
          h,
        ),
        input,
      ])
}
