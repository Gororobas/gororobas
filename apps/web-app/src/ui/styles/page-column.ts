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

/**
 * For side-scrolling strips inside the page column, such as tabs: they run to the screen's edges
 * instead of being clipped by the column's padding, while their content still lines up with it.
 */
export const pageColumnBleedStyle = Style.make({
  marginInline: `calc(-1 * ${space[4]})`,
  paddingInline: space[4],
  scrollPaddingInline: space[4],
}).pipe(
  Style.when(breakpoint.sm, {
    marginInline: `calc(-1 * ${space[6]})`,
    paddingInline: space[6],
    scrollPaddingInline: space[6],
  }),
  Style.when(breakpoint.lg, {
    marginInline: `calc(-1 * ${space[8]})`,
    paddingInline: space[8],
    scrollPaddingInline: space[8],
  }),
)
