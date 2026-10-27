import type { Block } from "foldkit"

import { WikiArticleDefinition } from "./definition"

export const WikiArticleComposition = WikiArticleDefinition.makeComposition()
export type WikiArticleViewBuilder = Block.ViewBuilderFor<typeof WikiArticleComposition>
