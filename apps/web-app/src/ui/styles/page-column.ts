import { Style } from "@pleat/core"

import { breakpoint, measure, space } from "../theme"

/** The widest content column, shared by the app bar and full-width pages so their edges align. */
export const pageColumnStyle = Style.make({
  inlineSize: "100%",
  maxInlineSize: measure.wide,
  marginInline: "auto",
  paddingInline: space[4],
}).pipe(
  Style.when(breakpoint.sm, { paddingInline: space[6] }),
  Style.when(breakpoint.lg, { paddingInline: space[8] }),
)
