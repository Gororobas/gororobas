import { BookmarkState, PublicationKind } from "@gororobas/domain/common/enums"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import {
  RelatedWikiArticle,
  WikiArticleBookmarker,
  WikiArticleContributor,
  WikiArticleKind,
  WikiArticleQueriedCardData,
  WikiArticleQueriedPageData,
} from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

import { ClientFailure } from "../../lib/client-failure"
import { ViewerBookmarks } from "../../lib/viewer-bookmarks"

export const Message = defineMessageUnion({
  SucceededLoadPage: { page: WikiArticleQueriedPageData },
  FailedLoadPage: { error: ClientFailure },
  SucceededLoadRelated: { articles: Schema.Array(RelatedWikiArticle) },
  FailedLoadRelated: { error: ClientFailure },
  SucceededLoadBookmarkers: { bookmarkers: Schema.Array(WikiArticleBookmarker) },
  FailedLoadBookmarkers: { error: ClientFailure },
  SucceededLoadContributors: { contributors: Schema.Array(WikiArticleContributor) },
  FailedLoadContributors: { error: ClientFailure },
  SucceededLoadCultivars: { cultivars: Schema.Array(WikiArticleQueriedCardData) },
  FailedLoadCultivars: { error: ClientFailure },
  SucceededLoadPublications: { publications: Schema.Array(ApiPublicationCardData) },
  FailedLoadPublications: { error: ClientFailure },
  UpdatedViewerBookmarks: { bookmarks: ViewerBookmarks },
  SelectedBookmarkState: { maybeState: Schema.Option(BookmarkState) },
  SucceededSaveBookmark: { maybeState: Schema.Option(BookmarkState) },
  FailedSaveBookmark: { error: Schema.String },
  ClickedBookmarkerFilter: { maybeState: Schema.Option(BookmarkState) },
  ClickedRelatedKindFilter: { maybeKind: Schema.Option(WikiArticleKind) },
  ClickedPhotoCategoryFilter: { maybeCategory: Schema.Option(Schema.String) },
  ClickedPublicationKindFilter: { maybeKind: Schema.Option(PublicationKind) },
})
