import { Recipe, Style, When } from "@pleat/core"

import { iconSizeProperty } from "../icons/icon-size"
import { focusRingDeclarations } from "../styles/focus-ring"
import {
  borderWidth,
  controlSize,
  duration,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  toneColors,
} from "../theme"

/** Marks AppButton roots, so children such as icons can adjust inside them. */
export const appButtonMarker = When.marker("app-button")

const enabled = (condition: When.Condition) => When.all(condition, When.not(When.disabled))

const focusRing = {
  ...focusRingDeclarations,
}

/** Colors come from the tone context (`toneColors`), so a button inherits the tone of the
 *  surface it sits on unless it sets its own. */
export const appButtonStyle = Recipe.make({
  name: "AppButton",
  base: Style.make({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    minInlineSize: 0,
    borderWidth: borderWidth.strong,
    borderStyle: "solid",
    // Squircles: the radius is capped at half the height, and corner-shape bends it into a
    // superellipse. Engines without corner-shape draw a pill.
    borderRadius: radius.full,
    cornerShape: "squircle",
    fontSize: fontSize.footnote,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.tight,
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    transitionProperty: "background-color, border-color, color, opacity, transform",
    transitionDuration: duration.control,
  }).pipe(
    Style.merge(Style.mark(appButtonMarker)),
    Style.when(enabled(When.active), { transform: "translateY(1px)" }),
    Style.when(When.focusVisible, focusRing),
    Style.when(When.disabled, { opacity: 0.5, cursor: "not-allowed" }),
  ),
  variants: {
    mode: {
      default: Style.make({
        backgroundColor: toneColors.action.background,
        borderColor: toneColors.action.background,
        color: toneColors.action.foreground,
      }).pipe(
        Style.when(enabled(When.hover), { opacity: 0.9 }),
        Style.when(enabled(When.active), { opacity: 0.8 }),
      ),
      outline: Style.make({
        backgroundColor: "transparent",
        borderColor: toneColors.controlBorder,
        color: toneColors.foreground,
      }).pipe(
        Style.when(enabled(When.hover), {
          backgroundColor: toneColors.backgroundCard,
          borderColor: toneColors.foreground,
        }),
        Style.when(enabled(When.focusVisible), { backgroundColor: toneColors.backgroundCard }),
      ),
      faded: Style.make({
        backgroundColor: toneColors.background,
        borderColor: toneColors.background,
        color: toneColors.foreground,
      }).pipe(
        Style.when(enabled(When.hover), { borderColor: toneColors.controlBorder }),
        Style.when(enabled(When.active), { backgroundColor: toneColors.backgroundMuted }),
      ),
      bleed: Style.make({
        backgroundColor: "transparent",
        borderColor: "transparent",
        color: toneColors.foreground,
      }).pipe(
        Style.when(enabled(When.hover), { backgroundColor: toneColors.hover }),
        Style.when(enabled(When.focusVisible), { backgroundColor: toneColors.hover }),
        Style.when(enabled(When.active), { backgroundColor: toneColors.pressed }),
      ),
    },
    size: {
      sm: { minBlockSize: controlSize.sm, paddingInline: space[3], paddingBlock: space[1] },
      md: { minBlockSize: controlSize.md, paddingInline: space[4], paddingBlock: space[2] },
      lg: {
        minBlockSize: controlSize.lg,
        paddingInline: space[5],
        paddingBlock: space[2],
        fontWeight: fontWeight.semibold,
      },
    },
    isFullWidth: { true: { inlineSize: "100%" } },
    isIconOnly: { true: { aspectRatio: "1" } },
  },
  compounds: [
    { when: { isIconOnly: true, size: "sm" }, style: { [iconSizeProperty]: "1rem" } },
    { when: { isIconOnly: true, size: "md" }, style: { [iconSizeProperty]: "1.25rem" } },
    { when: { isIconOnly: true, size: "lg" }, style: { [iconSizeProperty]: "1.5rem" } },
  ],
  defaults: { mode: "default", size: "md", isFullWidth: false, isIconOnly: false },
})
