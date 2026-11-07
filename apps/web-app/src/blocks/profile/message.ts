import { BookmarkState, PublicationKind } from "@gororobas/domain/common/enums"
import { CreditedMediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { ProfilePageData } from "@gororobas/domain/profiles/domain"
import { ProfileBookmark, ProfileWikiContribution } from "@gororobas/domain/profiles/profile-page"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

import { ClientFailure } from "../../lib/client-failure"
import { Collection } from "./model"

/** Which page loaded: the first replaces what was there, as filters changed; later ones append. */
const page = { currentPage: Schema.Int }

export const Message = defineMessageUnion({
  SucceededLoadPage: { page: ProfilePageData },
  FailedLoadPage: { error: ClientFailure },
  SucceededLoadPublications: { publications: Schema.Array(ApiPublicationCardData), ...page },
  FailedLoadPublications: { error: ClientFailure },
  SucceededLoadPhotos: { photos: Schema.Array(CreditedMediaAssetRow), ...page },
  FailedLoadPhotos: { error: ClientFailure },
  SucceededLoadContributions: { contributions: Schema.Array(ProfileWikiContribution), ...page },
  FailedLoadContributions: { error: ClientFailure },
  SucceededLoadBookmarks: { bookmarks: Schema.Array(ProfileBookmark), ...page },
  FailedLoadBookmarks: { error: ClientFailure },
  /** The reader scrolled to the end of what's loaded of a collection. */
  ReachedCollectionEnd: { collection: Collection },
  ClickedPublicationKindFilter: { maybeKind: Schema.Option(PublicationKind) },
  ClickedBookmarkStateFilter: { maybeState: Schema.Option(BookmarkState) },
  ClickedBookmarkKindFilter: { maybeKind: Schema.Option(WikiArticleKind) },
  ChangedPhotoColumnCount: { columnCount: Schema.Int },
})
