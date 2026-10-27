import { Style } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import { AppButton } from "../app-button"
import { styledAttributes } from "../pleat-attributes"
import { breakpoint, space, toneColors, tones } from "../theme"

/** Scrolls sideways on small screens, bleeding to the page's edges; wraps on wide ones. */
export const choiceRowStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBlock: space[1],
  marginInline: `calc(-1 * ${space[4]})`,
  paddingInline: space[4],
}).pipe(
  Style.when(breakpoint.sm, { marginInline: `calc(-1 * ${space[6]})`, paddingInline: space[6] }),
  Style.when(breakpoint.md, {
    flexWrap: "wrap",
    overflowX: "visible",
    marginInline: 0,
    paddingInline: 0,
  }),
)

// NOTE: Faded buttons fill with their tone's background, which for neutral is the page's own
// color; choices use the muted step so unselected ones still read as buttons.
const choiceStyle = Style.make({
  flexShrink: 0,
  backgroundColor: toneColors.backgroundMuted,
  borderColor: toneColors.backgroundMuted,
})

const selectedChoiceStyle = Style.make({
  backgroundColor: tones.primary.ramp[300],
  borderColor: tones.primary.ramp[300],
})

export type Choice<Message> = Readonly<
  {
    label: string
    isSelected: boolean
  } & ({ href: string } | { onClick: Message })
>

/** Picks one of a few exclusive options: the chosen one in the primary tone, the rest neutral. */
export const choices = <Message>(
  { options }: Readonly<{ options: ReadonlyArray<Choice<Message>> }>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  options.map((option) =>
    AppButton.view(
      {
        children: [option.label],
        ...("href" in option
          ? { href: option.href, ariaCurrent: option.isSelected ? "true" : "false" }
          : {
              onClick: option.onClick,
              attributes: [h.AriaPressed(String(option.isSelected))],
            }),
        tone: option.isSelected ? "primary" : "neutral",
        mode: "faded",
        size: "sm",
        styles: [choiceStyle, ...(option.isSelected ? [selectedChoiceStyle] : [])],
      },
      h,
    ),
  )

/** A labelled row of {@link choices}, optionally followed by more controls. */
export const view = <Message>(
  {
    label,
    options,
    leading = [],
    trailing = [],
  }: Readonly<{
    label: string
    options: ReadonlyArray<Choice<Message>>
    leading?: ReadonlyArray<Html>
    trailing?: ReadonlyArray<Html>
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(styledAttributes([h.Role("group"), h.AriaLabel(label)], choiceRowStyle), [
    ...leading,
    ...choices({ options }, h),
    ...trailing,
  ])
