import { type Declarations, Style, When } from "@pleat/core"

import { borderWidth, toneColors } from "../theme"

/** The keyboard focus outline, for nesting under other conditions. */
export const focusRingDeclarations = {
  outline: `${borderWidth.strong} solid ${toneColors.focus}`,
  outlineOffset: borderWidth.strong,
} satisfies Declarations

/** Shows {@link focusRingDeclarations} while the element has keyboard focus. */
export const focusRingStyle = Style.make({ outline: "none" }).pipe(
  Style.when(When.focusVisible, focusRingDeclarations),
)

/** A focus ring drawn inside the element, for controls that sit flush against a clipping edge. */
export const insetFocusRingStyle = Style.make({ outline: "none" }).pipe(
  Style.when(When.focusVisible, {
    ...focusRingDeclarations,
    outlineOffset: `calc(-1 * ${borderWidth.strong})`,
  }),
)
