import { Schema } from "effect"

import { BookmarkState, SupportedLanguage } from "../common/enums.js"
import { IntNonNegative, TimestampColumn } from "../common/primitives.js"
import { CreditedMediaAssetRow } from "../media-assets/domain.js"
import { WikiArticleQueriedCardData } from "../wiki/wiki-article.js"

/** Content on a profile's page is named in the reader's language where it has translations. */
export const ProfileCollectionQuery = Schema.Struct({ language: SupportedLanguage })
export type ProfileCollectionQuery = typeof ProfileCollectionQuery.Type

/** An article the profile keeps track of, and how: wanting to plant it, planting it… */
export const ProfileBookmark = Schema.Struct({
  state: BookmarkState,
  article: WikiArticleQueriedCardData,
})

export type ProfileBookmark = typeof ProfileBookmark.Type

/** An article the profile helped write, with approved revisions or by creating it. */
export const ProfileWikiContribution = Schema.Struct({
  article: WikiArticleQueriedCardData,
  revisionCount: IntNonNegative,
  lastContributedAt: TimestampColumn,
})

export type ProfileWikiContribution = typeof ProfileWikiContribution.Type

/** Photos the profile uploaded that the reader may see, newest first. */
export const ProfilePhotos = Schema.Array(CreditedMediaAssetRow)
