import { Schema } from "effect"

import { BookmarkState } from "../common/enums.js"
import { PersonId, WikiArticleId } from "../common/ids.js"

export * from "./animal.js"
export * from "./concept.js"
export * from "./plant.js"
export * from "./tool.js"
export * from "./uncategorized.js"
export * from "./wiki-article-translation.js"
export * from "./wiki-article.js"

/** Search filters will be added once wiki-specific filtering is designed. */
export const WikiSearchParams = Schema.Struct({})
export type WikiSearchParams = typeof WikiSearchParams.Type

export const WikiArticleBookmarkRow = Schema.Struct({
  personId: PersonId,
  state: BookmarkState,
  wikiArticleId: WikiArticleId,
})
export type WikiArticleBookmarkRow = typeof WikiArticleBookmarkRow.Type
