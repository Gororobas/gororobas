import { Recipe, Style, When } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import type { IconConfig } from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import {
  borderWidth,
  duration,
  easing,
  fontSize,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
} from "../theme"

/** Shared by the current tab and the indicator; `anchor-scope` keeps each list's apart. */
const CURRENT_TAB_ANCHOR = "--tab-navigation-current"

const INDICATOR_THICKNESS = "3px"

/** Browsers that can keep anchors apart slide one indicator between tabs; others underline each tab. */
const SLIDING_INDICATOR_QUERY = "(anchor-scope: all) and (anchor-name: --a)"
const supportsSlidingIndicator = When.supports(SLIDING_INDICATOR_QUERY)
const lacksSlidingIndicator = When.supports(`not (${SLIDING_INDICATOR_QUERY})`)

const listStyle = Style.make({
  position: "relative",
  display: "flex",
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBlockEnd: INDICATOR_THICKNESS,
  anchorScope: CURRENT_TAB_ANCHOR,
})

/** No gap between tabs: each tab's padding spaces them, so the hit areas touch. */
const tabStyle = Recipe.make({
  name: "TabNavigationTab",
  base: Style.make({
    position: "relative",
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: space[2],
    borderRadius: radius.full,
    cornerShape: "squircle",
    color: tones.neutral.shade[700],
    fontWeight: fontWeight.semibold,
    whiteSpace: "nowrap",
    outline: "none",
    transitionProperty: "color, background-color",
    transitionDuration: duration.control,
  }).pipe(
    Style.when(When.hover, { color: tones.neutral.shade[900], backgroundColor: toneColors.hover }),
    Style.when(When.focusVisible, focusRingDeclarations),
  ),
  variants: {
    size: {
      regular: { paddingInline: space[4], paddingBlock: space[3] },
      compact: { paddingInline: space[3], paddingBlock: space[2], fontSize: fontSize.footnote },
    },
    isCurrent: {
      true: Style.make({ color: tones.accent.shade[800], anchorName: CURRENT_TAB_ANCHOR }).pipe(
        // Without a sliding indicator, the current tab draws its own.
        Style.when(lacksSlidingIndicator, {
          textDecorationLine: "underline",
          textDecorationThickness: borderWidth.strong,
          textDecorationColor: tones.accent.shade[600],
          textUnderlineOffset: space[2],
        }),
      ),
      false: {},
    },
  },
  defaults: { size: "regular", isCurrent: false },
})

/** Sits under the current tab's label, and slides when another tab becomes current. */
const indicatorStyle = Recipe.make({
  name: "TabNavigationIndicator",
  base: Style.make({ display: "none" }).pipe(
    Style.when(supportsSlidingIndicator, {
      display: "block",
      position: "absolute",
      positionAnchor: CURRENT_TAB_ANCHOR,
      insetBlockEnd: 0,
      blockSize: INDICATOR_THICKNESS,
      borderRadius: radius.full,
      backgroundColor: tones.accent.shade[600],
      pointerEvents: "none",
      transitionProperty: "left, right",
      transitionDuration: duration.slow,
      transitionTimingFunction: easing.emphasized,
    }),
    Style.when(When.all(supportsSlidingIndicator, When.reducedMotion), {
      transitionDuration: "0s",
    }),
  ),
  variants: {
    // The indicator spans the label, inset by the tab's own padding.
    size: {
      regular: {
        left: `calc(anchor(left) + ${space[4]})`,
        right: `calc(anchor(right) + ${space[4]})`,
      },
      compact: {
        left: `calc(anchor(left) + ${space[3]})`,
        right: `calc(anchor(right) + ${space[3]})`,
      },
    },
  },
  defaults: { size: "regular" },
})

export type TabNavigationItem = Readonly<{
  /** Identifies the tab among its siblings, such as its route. */
  key: string
  label: string
  href: string
  isCurrent: boolean
  maybeIcon?: (config?: IconConfig) => Html
}>

export type TabNavigationConfig = Readonly<{
  /** Names the navigation for assistive technology, such as "Sections of Kale". */
  ariaLabel: string
  items: ReadonlyArray<TabNavigationItem>
  /** Compact tabs are smaller and leave their icons out, for condensed headers. */
  size?: "regular" | "compact"
  /** Extra styles for the scrolling list, such as bleeding past its column's padding. */
  styles?: ReadonlyArray<Style.Style>
}>

/** Links between a page's sections, underlined by an indicator that slides to the current one. */
export const view = <Message>(config: TabNavigationConfig, h: HtmlBuilder<Message>): Html => {
  const size = config.size ?? "regular"
  const hasCurrent = config.items.some((item) => item.isCurrent)

  return h.nav(
    styledAttributes([h.AriaLabel(config.ariaLabel)], listStyle, ...(config.styles ?? [])),
    [
      ...config.items.map((item) =>
        h.keyed("a")(
          item.key,
          styledAttributes(
            [h.Href(item.href), h.AriaCurrent(item.isCurrent ? "page" : "false")],
            tabStyle({ size, isCurrent: item.isCurrent }),
          ),
          [
            ...(size === "compact" || item.maybeIcon === undefined
              ? []
              : [item.maybeIcon({ mode: item.isCurrent ? "duotone" : "outline" })]),
            item.label,
          ],
        ),
      ),
      // Keyed so patches keep the same element, which is what lets it transition.
      ...(hasCurrent
        ? [
            h.keyed("span")(
              "indicator",
              styledAttributes([h.AriaHidden(true)], indicatorStyle({ size })),
            ),
          ]
        : []),
    ],
  )
}
