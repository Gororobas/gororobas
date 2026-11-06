import { BookmarkState, PublicationKind } from "@gororobas/domain/common/enums"
import { CreditedMediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { ProfilePageData } from "@gororobas/domain/profiles/domain"
import { ProfileBookmark, ProfileWikiContribution } from "@gororobas/domain/profiles/profile-page"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

import { ClientFailure } from "../../lib/client-failure"

export const Message = defineMessageUnion({
  SucceededLoadPage: { page: ProfilePageData },
  FailedLoadPage: { error: ClientFailure },
  SucceededLoadPublications: { publications: Schema.Array(ApiPublicationCardData) },
  FailedLoadPublications: { error: ClientFailure },
  SucceededLoadPhotos: { photos: Schema.Array(CreditedMediaAssetRow) },
  FailedLoadPhotos: { error: ClientFailure },
  SucceededLoadContributions: { contributions: Schema.Array(ProfileWikiContribution) },
  FailedLoadContributions: { error: ClientFailure },
  SucceededLoadBookmarks: { bookmarks: Schema.Array(ProfileBookmark) },
  FailedLoadBookmarks: { error: ClientFailure },
  ClickedPublicationKindFilter: { maybeKind: Schema.Option(PublicationKind) },
  ClickedBookmarkStateFilter: { maybeState: Schema.Option(BookmarkState) },
  ChangedPhotoColumnCount: { columnCount: Schema.Int },
})
