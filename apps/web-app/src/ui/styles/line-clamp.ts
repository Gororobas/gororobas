import { Style } from "@pleat/core"

/** Cuts text to two lines with an ellipsis, so long captions don't outgrow their photos. */
export const twoLineClampStyle = Style.make({
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
})
