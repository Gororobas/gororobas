import { Schema } from "effect"

import { BookmarkState, SupportedLanguage } from "../common/enums.js"
import { IntNonNegative, PaginationOptions, TimestampColumn } from "../common/primitives.js"
import { CreditedMediaAssetRow } from "../media-assets/domain.js"
import { WikiArticleKind, WikiArticleQueriedCardData } from "../wiki/wiki-article.js"

/**
 * How many items a page of a profile's collections holds. A shorter page is the last one, which
 * is how readers know there's no more to load.
 */
export const PROFILE_COLLECTION_PAGE_SIZE = 24

const currentPage = PaginationOptions.fields.currentPage

export const ProfilePhotosQuery = Schema.Struct({ currentPage })
export type ProfilePhotosQuery = typeof ProfilePhotosQuery.Type

/** Content on a profile's page is named in the reader's language where it has translations. */
export const ProfileCollectionQuery = Schema.Struct({ language: SupportedLanguage, currentPage })
export type ProfileCollectionQuery = typeof ProfileCollectionQuery.Type

export const ProfileBookmarksQuery = Schema.Struct({
  ...ProfileCollectionQuery.fields,
  kind: Schema.optionalKey(WikiArticleKind),
  state: Schema.optionalKey(BookmarkState),
})

export type ProfileBookmarksQuery = typeof ProfileBookmarksQuery.Type

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

/** Photos credited to the profile, as the person who took them, that the reader may see, newest first. */
export const ProfilePhotos = Schema.Array(CreditedMediaAssetRow)
