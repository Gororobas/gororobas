import { PopoverBlock } from "@foldkit/ui"
import { ProfileCardData } from "@gororobas/domain/profiles/domain"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { AsyncData } from "foldkit"

import { SearchQuery } from "../../app/route"
import { ClientFailure } from "../../lib/client-failure"
import { RecentSearches } from "../../lib/recent-searches"
import { ViewerBookmarks } from "../../lib/viewer-bookmarks"
import { DrawerBlock } from "../../ui/drawer/drawer"

export const WikiResults = AsyncData.Schema(Schema.Array(WikiArticleQueriedCardData), ClientFailure)
export const PublicationResults = AsyncData.Schema(
  Schema.Array(ApiPublicationCardData),
  ClientFailure,
)
export const ProfileResults = AsyncData.Schema(Schema.Array(ProfileCardData), ClientFailure)

export const Model = Schema.Struct({
  /** The query the results answer. The URL holds the query being shown. */
  maybeAnsweredQuery: Schema.Option(SearchQuery),
  wikiAsyncData: WikiResults.schema,
  publicationsAsyncData: PublicationResults.schema,
  profilesAsyncData: ProfileResults.schema,
  viewerBookmarks: ViewerBookmarks,
  recentSearches: RecentSearches,
  filtersDrawer: DrawerBlock.Model,
  filterPopovers: Schema.Array(PopoverBlock.Model),
})

export type Model = typeof Model.Type
