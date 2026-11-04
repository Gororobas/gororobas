import { Style } from "@pleat/core"

import { borderWidth, layer, radius, space, toneColors } from "../theme"

/** A floating panel anchored to the control that opened it, such as `@foldkit/ui`'s Popover panel. */
export const popoverPanelStyle = Style.make({
  zIndex: layer.overlay,
  display: "grid",
  rowGap: space[3],
  inlineSize: "min(22rem, calc(100vw - 2rem))",
  padding: space[4],
  border: `${borderWidth.hairline} solid ${toneColors.border}`,
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
  outline: "none",
})

/** Catches clicks outside an open popover, which close it. */
export const popoverBackdropStyle = Style.make({
  position: "fixed",
  inset: 0,
  zIndex: layer.raised,
})
