import { Style, When } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import * as Icons from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { borderWidth, fontSize, lineHeight, radius, space, tones } from "../theme"
import { chipStyle } from "./view"

const triggerStyle = Style.make({ border: 0 })

const iconStyle = Style.make({ opacity: 0.7 })

// NOTE: A native popover opens on tap and keyboard alike and closes on outside clicks and
// Escape, without a model for every chip. Where anchor positioning is supported it sits under
// its chip; elsewhere it keeps the browser's centered placement.
const popoverStyle = Style.make({
  maxInlineSize: "min(22rem, calc(100vw - 2rem))",
  padding: space[3],
  border: `${borderWidth.hairline} solid ${tones.primary.ramp[300]}`,
  borderRadius: radius.md,
  backgroundColor: tones.primary.backgroundCard,
  boxShadow: "0 12px 32px rgb(0 0 0 / 12%)",
  color: tones.neutral.ramp[800],
  fontSize: fontSize.footnote,
  lineHeight: lineHeight.normal,
}).pipe(
  Style.when(When.supports("(anchor-name: --chip)"), {
    inset: "auto",
    marginBlock: space[2],
    positionArea: "block-end span-inline-end",
    positionTryFallbacks: "flip-block, flip-inline",
  }),
)

export type ExplainedChipConfig = Readonly<{
  /** Unique within the page: it names the popover and anchors it to the chip. */
  id: string
  label: string
  explainer: string
}>

/** A value chip whose explainer opens beside it, such as what an "Emergente" stratum means. */
export const view = <Message>(
  { id, label, explainer }: ExplainedChipConfig,
  h: HtmlBuilder<Message>,
): Html => {
  const anchor = `--${id}`

  return h.span(
    [],
    [
      h.button(
        styledAttributes(
          [
            h.Type("button"),
            h.Attribute("popovertarget", id),
            h.AriaDescription(`O que significa ${label}?`),
          ],
          chipStyle({ appearance: "tag", isInteractive: true }),
          triggerStyle,
          Style.make({ anchorName: anchor }),
        ),
        [label, Icons.infoCircle({ size: "sm", mode: "duotone", styles: [iconStyle] })],
      ),
      h.div(
        styledAttributes(
          [h.Id(id), h.Attribute("popover", "auto")],
          popoverStyle,
          Style.make({ positionAnchor: anchor }),
        ),
        [explainer],
      ),
    ],
  )
}
