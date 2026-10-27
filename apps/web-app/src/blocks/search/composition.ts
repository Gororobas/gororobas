import { PopoverBlock } from "@foldkit/ui"
import type { Block } from "foldkit"

import { DrawerBlock } from "../../ui/drawer/drawer"
import { SearchDefinition, makeNoopStep } from "./definition"
import { FilterGroupId } from "./filters"

export const filterPopoverId = (group: FilterGroupId) => `search-filter-${group}`

export const FiltersDrawerBinding = SearchDefinition.makeBinding(DrawerBlock, {
  field: "filtersDrawer",
  init: { contextToArgs: () => [{ id: "search-filters", isAnimated: true }] },
}).withOutMessagePolicy({
  fold: SearchDefinition.makeOutMessageFold(DrawerBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
  }),
})

const foldPopoverOutMessage = SearchDefinition.makeOutMessageFold(PopoverBlock, {
  Opened: makeNoopStep,
  Closed: makeNoopStep,
})

/** One popover per filter group, so wide screens can open a group in place. */
export const FilterPopoversBinding = SearchDefinition.makeBinding(PopoverBlock, {
  field: "filterPopovers",
  key: "id",
  init: {
    instances: () =>
      FilterGroupId.literals.map((group) => ({
        key: filterPopoverId(group),
        args: [{ id: filterPopoverId(group) }],
      })),
    toItem: (_occurrence, popover) => popover,
  },
}).withOutMessagePolicy({
  fold: (_popoverId, outMessage) => foldPopoverOutMessage(outMessage),
})

export const SearchComposition = SearchDefinition.makeComposition({
  bindings: [FiltersDrawerBinding, FilterPopoversBinding],
})
export type SearchViewBuilder = Block.ViewBuilderFor<typeof SearchComposition>
