import type { Block } from "foldkit"

import { PopoverDrawerBlock } from "../../ui/popover-drawer"
import { WikiArticleBlock } from "./definition"
import { AttributedSection } from "./model"

/** Someone's own relationship to the article. */
export const BookmarkPickerBinding = WikiArticleBlock.makeBinding(PopoverDrawerBlock, {
  field: "bookmarkPicker",
  init: { contextToArgs: () => [{ id: "wiki-article-bookmark" }] },
})

/** A plant's whole classification, behind its one-line breadcrumb. */
export const ClassificationBinding = WikiArticleBlock.makeBinding(PopoverDrawerBlock, {
  field: "classification",
  init: { contextToArgs: () => [{ id: "wiki-article-classification" }] },
})

export const attributionId = (section: AttributedSection) => `wiki-article-attribution-${section}`

/** One per section of provider data, crediting where it came from. */
export const AttributionsBinding = WikiArticleBlock.makeBinding(PopoverDrawerBlock, {
  field: "attributions",
  key: "id",
  init: {
    instances: () =>
      AttributedSection.literals.map((section) => ({
        key: attributionId(section),
        args: [{ id: attributionId(section) }],
      })),
    toItem: (_occurrence, attribution) => attribution,
  },
})

export const WikiArticleComposition = WikiArticleBlock.makeComposition({
  bindings: [BookmarkPickerBinding, ClassificationBinding, AttributionsBinding],
})
export type WikiArticleViewBuilder = Block.ViewBuilderFor<typeof WikiArticleComposition>
