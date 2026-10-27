import { Style } from "@pleat/core"

/** Hides an element visually while keeping it available to assistive technology. */
export const visuallyHiddenStyle = Style.make({
  position: "absolute",
  inlineSize: "1px",
  blockSize: "1px",
  padding: 0,
  // oxlint-disable-next-line design-system/require-pleat-space-tokens -- the standard clip pattern
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
})
