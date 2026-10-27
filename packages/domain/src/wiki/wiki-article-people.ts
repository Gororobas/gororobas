import { Schema } from "effect"

import { BookmarkState } from "../common/enums.js"
import { IntNonNegative, TimestampColumn } from "../common/primitives.js"
import { ProfileCardData } from "../profiles/domain.js"

/** A public profile that bookmarked an article, such as someone planting it. */
export const WikiArticleBookmarker = Schema.Struct({
  state: BookmarkState,
  profile: ProfileCardData,
})

export type WikiArticleBookmarker = typeof WikiArticleBookmarker.Type

/** A public profile whose revisions shaped the article, either creating it or with approved edits. */
export const WikiArticleContributor = Schema.Struct({
  profile: ProfileCardData,
  revisionCount: IntNonNegative,
  lastContributedAt: TimestampColumn,
})

export type WikiArticleContributor = typeof WikiArticleContributor.Type
