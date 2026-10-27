import { Style, When } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { controlSize, duration, fontSize, fontWeight, radius, space, tones } from "../theme"

const trackStyle = Style.make({
  display: "inline-flex",
  gap: space[1],
  padding: space[1],
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.neutral.ramp[100],
})

const segmentStyle = Style.make({
  blockSize: `calc(${controlSize.sm} - ${space[1]})`,
  paddingInline: space[4],
  border: 0,
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: "transparent",
  color: tones.neutral.ramp[700],
  fontSize: fontSize.footnote,
  fontWeight: fontWeight.semibold,
  whiteSpace: "nowrap",
  cursor: "pointer",
  outline: "none",
  transitionProperty: "background-color, color, box-shadow",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { color: tones.neutral.ramp[900] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const selectedSegmentStyle = Style.make({
  backgroundColor: tones.primary.backgroundCard,
  color: tones.accent.ramp[800],
  boxShadow: "0 1px 3px rgb(0 0 0 / 12%)",
})

export type Segment<Message> = Readonly<{ label: string; isSelected: boolean; onClick: Message }>

/** A switch between a few exclusive choices, such as every profile, people or organizations. */
export const view = <Message>(
  { label, segments }: Readonly<{ label: string; segments: ReadonlyArray<Segment<Message>> }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    styledAttributes([h.Role("group"), h.AriaLabel(label)], trackStyle),
    segments.map((segment) =>
      h.button(
        styledAttributes(
          [h.Type("button"), h.AriaPressed(String(segment.isSelected)), h.OnClick(segment.onClick)],
          segmentStyle,
          ...(segment.isSelected ? [selectedSegmentStyle] : []),
        ),
        [segment.label],
      ),
    ),
  )
