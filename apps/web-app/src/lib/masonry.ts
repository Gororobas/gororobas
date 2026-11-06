import { Array as EffectArray } from "effect"

type Column<Item> = Readonly<{ items: ReadonlyArray<Item>; height: number }>

/**
 * Spreads items across columns of equal width, each into the shortest column so far, so columns
 * end at similar heights and the first items stay at the top. `heightRatio` is an item's height
 * over its width.
 */
export const masonryColumns = <Item>(
  items: ReadonlyArray<Item>,
  {
    columnCount,
    heightRatio,
  }: Readonly<{ columnCount: number; heightRatio: (item: Item) => number }>,
): ReadonlyArray<ReadonlyArray<Item>> =>
  items
    .reduce<ReadonlyArray<Column<Item>>>(
      (columns, item) => {
        const heights = columns.map((column) => column.height)
        const shortest = heights.indexOf(Math.min(...heights))

        return columns.map((column, index) =>
          index === shortest
            ? { items: [...column.items, item], height: column.height + heightRatio(item) }
            : column,
        )
      },
      EffectArray.makeBy(Math.max(1, columnCount), () => ({ items: [], height: 0 })),
    )
    .map((column) => column.items)
