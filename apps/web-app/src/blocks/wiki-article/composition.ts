import { PopoverBlock } from "@foldkit/ui"
import type { Block } from "foldkit"

import { DrawerBlock } from "../../ui/drawer/drawer"
import { WikiArticleBlock, makeNoopStep } from "./definition"
import { ExternalDataSection } from "./model"

/** Wide screens choose a bookmark state in a popover; phones in a drawer. */
export const BookmarkPopoverBinding = WikiArticleBlock.makeBinding(PopoverBlock, {
  field: "bookmarkPopover",
  init: { contextToArgs: () => [{ id: "wiki-article-bookmark", isAnimated: true }] },
}).withOutMessagePolicy({
  fold: WikiArticleBlock.makeOutMessageFold(PopoverBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
  }),
})

export const BookmarkDrawerBinding = WikiArticleBlock.makeBinding(DrawerBlock, {
  field: "bookmarkDrawer",
  init: { contextToArgs: () => [{ id: "wiki-article-bookmark-drawer", isAnimated: true }] },
}).withOutMessagePolicy({
  fold: WikiArticleBlock.makeOutMessageFold(DrawerBlock, {
    Opened: makeNoopStep,
    Closed: makeNoopStep,
  }),
})

export const attributionPopoverId = (section: ExternalDataSection) =>
  `wiki-article-attribution-${section}`

/** One popover per section of provider data, crediting where it came from. */
export const AttributionPopoversBinding = WikiArticleBlock.makeBinding(PopoverBlock, {
  field: "attributionPopovers",
  key: "id",
  init: {
    instances: () =>
      ExternalDataSection.literals.map((section) => ({
        key: attributionPopoverId(section),
        args: [{ id: attributionPopoverId(section) }],
      })),
    toItem: (_occurrence, popover) => popover,
  },
}).withOutMessagePolicy({
  fold: (_popoverId, outMessage) =>
    WikiArticleBlock.makeOutMessageFold(PopoverBlock, {
      Opened: makeNoopStep,
      Closed: makeNoopStep,
    })(outMessage),
})

export const WikiArticleComposition = WikiArticleBlock.makeComposition({
  bindings: [BookmarkPopoverBinding, BookmarkDrawerBinding, AttributionPopoversBinding],
})
export type WikiArticleViewBuilder = Block.ViewBuilderFor<typeof WikiArticleComposition>
