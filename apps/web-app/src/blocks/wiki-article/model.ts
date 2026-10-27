import { BookmarkState, PublicationKind } from "@gororobas/domain/common/enums"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import {
  RelatedWikiArticle,
  WikiArticleBookmarker,
  WikiArticleContributor,
  WikiArticleKind,
  WikiArticleLookup,
  WikiArticleQueriedPageData,
} from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { AsyncData } from "foldkit"
import { defineTaggedUnion } from "foldkit/schema"

import { ViewerBookmarks } from "../../lib/viewer-bookmarks"

export const PageResult = AsyncData.Schema(WikiArticleQueriedPageData, Schema.String)
export const RelatedResults = AsyncData.Schema(Schema.Array(RelatedWikiArticle), Schema.String)
export const BookmarkerResults = AsyncData.Schema(
  Schema.Array(WikiArticleBookmarker),
  Schema.String,
)
export const ContributorResults = AsyncData.Schema(
  Schema.Array(WikiArticleContributor),
  Schema.String,
)
export const PublicationResults = AsyncData.Schema(
  Schema.Array(ApiPublicationCardData),
  Schema.String,
)

export const BookmarkSaving = defineTaggedUnion({
  Idle: {},
  Saving: {},
  Failed: { error: Schema.String },
})

export const Model = Schema.Struct({
  lookup: WikiArticleLookup,
  pageAsyncData: PageResult.schema,
  relatedAsyncData: RelatedResults.schema,
  bookmarkersAsyncData: BookmarkerResults.schema,
  contributorsAsyncData: ContributorResults.schema,
  publicationsAsyncData: PublicationResults.schema,
  viewerBookmarks: ViewerBookmarks,
  bookmarkSaving: BookmarkSaving,
  maybeBookmarkerFilter: Schema.Option(BookmarkState),
  maybeRelatedKindFilter: Schema.Option(WikiArticleKind),
  maybePhotoCategoryFilter: Schema.Option(Schema.String),
  maybePublicationKindFilter: Schema.Option(PublicationKind),
})

export type Model = typeof Model.Type
