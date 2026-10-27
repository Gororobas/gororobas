import { When } from "@pleat/core"

/** Viewport widths where layouts change. Media queries can't read custom properties, so these
 *  are conditions rather than tokens. `md` is where drawers become centered dialogs. */
export const breakpoint = {
  sm: When.minWidth("40rem"),
  md: When.minWidth("48rem"),
  lg: When.minWidth("64rem"),
} as const
