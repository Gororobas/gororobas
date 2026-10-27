import { Recipe, Style } from "@pleat/core"

import { borderWidth, fontSize, radius, space, toneColors } from "../theme"

/** A dashed placeholder for empty lists, missing content and dead ends. */
export const emptyStateStyle = Recipe.make({
  name: "EmptyState",
  base: {
    border: `${borderWidth.hairline} dashed ${toneColors.border}`,
    color: toneColors.foregroundMuted,
    fontSize: fontSize.footnote,
  },
  variants: {
    size: {
      compact: { borderRadius: radius.md, padding: space[4] },
      roomy: { borderRadius: radius.lg, padding: space[6] },
    },
  },
  defaults: { size: "compact" },
})

/** Separates a closing section, such as account or owner controls, from what comes before. */
export const sectionDividerStyle = Style.make({
  marginBlockStart: space[5],
  borderBlockStart: `${borderWidth.hairline} solid ${toneColors.border}`,
  paddingBlockStart: space[5],
})
