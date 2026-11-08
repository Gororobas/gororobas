import { Style, When } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import type { IconConfig } from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { borderWidth, duration, radius, space, toneColors, tones } from "../theme"
import { visuallyHiddenStyle } from "../visually-hidden"

const optionsStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
  gap: space[2],
})

const optionStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "start",
  columnGap: space[2],
  rowGap: space[1],
  padding: space[3],
  borderRadius: radius.md,
  border: `${borderWidth.strong} solid ${tones.neutral.shade[200]}`,
  backgroundColor: toneColors.backgroundCard,
  cursor: "pointer",
  transitionProperty: "border-color, background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { borderColor: tones.neutral.shade[400] }),
  Style.when(When.has(When.focusVisible), focusRingDeclarations),
)

const selectedOptionStyle = Style.make({
  borderColor: tones.primary.shade[600],
  backgroundColor: tones.primary.shade[100],
}).pipe(Style.when(When.hover, { borderColor: tones.primary.shade[600] }))

const disabledOptionStyle = Style.make({ opacity: 0.6, cursor: "progress" })

export type OptionCard<Message> = Readonly<{
  value: string
  label: string
  description: string
  icon: (config?: IconConfig) => Html
  isSelected: boolean
  onSelect: Message
}>

/**
 * One choice among a few, each a card with an icon and what choosing it means. Radio buttons
 * underneath, so arrow keys move between them; wrap it in a fieldset with a legend.
 */
export const view = <Message>(
  {
    name,
    options,
    isDisabled = false,
  }: Readonly<{
    /** Groups the radio buttons: unique on the page. */
    name: string
    options: ReadonlyArray<OptionCard<Message>>
    isDisabled?: boolean
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    styledAttributes([], optionsStyle),
    options.map((option) =>
      AppText.view(
        {
          element: "label",
          styles: [
            optionStyle,
            ...(option.isSelected ? [selectedOptionStyle] : []),
            ...(isDisabled ? [disabledOptionStyle] : []),
          ],
          children: [
            h.input(
              styledAttributes(
                [
                  h.Type("radio"),
                  h.Name(name),
                  h.Value(option.value),
                  h.Checked(option.isSelected),
                  h.Disabled(isDisabled),
                  h.OnChange(() => option.onSelect),
                ],
                visuallyHiddenStyle,
              ),
            ),
            option.icon({ size: "sm", tone: option.isSelected ? "primary" : "inherit" }),
            AppText.view(
              {
                element: "span",
                appearance: "footnote",
                weight: "semibold",
                children: [option.label],
              },
              h,
            ),
            AppText.view(
              {
                element: "span",
                appearance: "caption",
                isMuted: true,
                lineHeight: "normal",
                styles: [Style.make({ gridColumn: "2" })],
                children: [option.description],
              },
              h,
            ),
          ],
        },
        h,
      ),
    ),
  )
