import type { Block } from "foldkit"

import { WikiArticleBlock } from "./definition"

export const WikiArticleComposition = WikiArticleBlock.makeComposition()
export type WikiArticleViewBuilder = Block.ViewBuilderFor<typeof WikiArticleComposition>
