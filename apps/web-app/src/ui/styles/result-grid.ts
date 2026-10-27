import { Style, When } from "@pleat/core"

import { space } from "../theme"

/** Column counts by the width available to the grid, narrowest first. */
const columnSteps = [
  // NOTE: Pleat rejects `<` and `>` in queries, so ranges use min/max-width.
  { columns: 1, query: "(max-width: 33.99rem)" },
  { columns: 2, query: "(min-width: 34rem) and (max-width: 51.99rem)" },
  { columns: 3, query: "(min-width: 52rem) and (max-width: 69.99rem)" },
  { columns: 4, query: "(min-width: 70rem)" },
] as const

export type ColumnCount = (typeof columnSteps)[number]["columns"]

/** Wraps a result grid, so its columns follow the space it has rather than the viewport. */
export const resultGridContainerStyle = Style.make({ containerType: "inline-size" })

export const resultGridStyle = columnSteps.reduce(
  (style, { columns, query }) =>
    style.pipe(
      Style.when(When.container(query), {
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }),
    ),
  Style.make({ display: "grid", gap: space[3] }),
)

/** The most items any column count shows, for previews to request. */
export const previewCapacity = (shownAt: (columns: ColumnCount) => number): number =>
  Math.max(...columnSteps.map(({ columns }) => shownAt(columns)))

/**
 * Hides items past the ones a preview shows at the current column count, so a preview always
 * ends on a full row when there are more results than it shows.
 */
export const previewItemStyle = (shownAt: (columns: ColumnCount) => number) =>
  columnSteps.reduce(
    (style, { columns, query }) =>
      style.pipe(
        Style.when(
          When.all(When.container(query), When.pseudo(`:nth-child(n+${shownAt(columns) + 1})`)),
          { display: "none" },
        ),
      ),
    Style.make({}),
  )
