import { ProfileCardData } from "@gororobas/domain/profiles/domain"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

import { SearchQuery } from "../../app/route"
import { RecentSearches } from "../../lib/recent-searches"
import { ViewerBookmarks } from "../../lib/viewer-bookmarks"

export const Navigation = Schema.Literals(["Replace", "Push"])

export const Message = defineMessageUnion({
  InformedOfQueryChange: { query: SearchQuery },
  /** The app reports leaving search through one of its results. */
  InformedOfOpenedResult: { query: SearchQuery },
  SubmittedSearch: { query: SearchQuery },
  ClickedRemoveRecentSearch: { index: Schema.Finite },
  SucceededLoadRecentSearches: { recentSearches: RecentSearches },
  CompletedSaveRecentSearches: {},
  ChangedSearchQuery: { query: SearchQuery, navigation: Navigation },
  CompletedNavigateSearch: {},
  ClickedOpenFilters: {},
  ClickedCloseFilters: {},
  SucceededSearchWiki: { articles: Schema.Array(WikiArticleQueriedCardData) },
  FailedSearchWiki: { error: Schema.String },
  SucceededSearchPublications: { publications: Schema.Array(ApiPublicationCardData) },
  FailedSearchPublications: { error: Schema.String },
  SucceededSearchProfiles: { profiles: Schema.Array(ProfileCardData) },
  FailedSearchProfiles: { error: Schema.String },
  UpdatedViewerBookmarks: { bookmarks: ViewerBookmarks },
})
