import { BookmarkState, PublicationKind, SupportedLanguage } from "@gororobas/domain/common/enums"
import { Handle } from "@gororobas/domain/common/primitives"
import { CreditedMediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { ProfilePageData } from "@gororobas/domain/profiles/domain"
import { ProfileBookmark, ProfileWikiContribution } from "@gororobas/domain/profiles/profile-page"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import { Schema } from "effect"
import { AsyncData } from "foldkit"

import { ClientFailure } from "../../lib/client-failure"

export const PageResult = AsyncData.Schema(ProfilePageData, ClientFailure)
export const PublicationResults = AsyncData.Schema(
  Schema.Array(ApiPublicationCardData),
  ClientFailure,
)
export const PhotoResults = AsyncData.Schema(Schema.Array(CreditedMediaAssetRow), ClientFailure)
export const ContributionResults = AsyncData.Schema(
  Schema.Array(ProfileWikiContribution),
  ClientFailure,
)
export const BookmarkResults = AsyncData.Schema(Schema.Array(ProfileBookmark), ClientFailure)

export const Model = Schema.Struct({
  handle: Handle,
  /** The language its content loads in, which is the app's. */
  language: SupportedLanguage,
  pageAsyncData: PageResult.schema,
  /** Loads once the page has, as publications are found by the profile's ID. */
  publicationsAsyncData: PublicationResults.schema,
  photosAsyncData: PhotoResults.schema,
  contributionsAsyncData: ContributionResults.schema,
  bookmarksAsyncData: BookmarkResults.schema,
  maybePublicationKindFilter: Schema.Option(PublicationKind),
  maybeBookmarkStateFilter: Schema.Option(BookmarkState),
  /** The photo gallery lays photos out in JavaScript, so it follows the viewport's width. */
  photoColumnCount: Schema.Int,
})

export type Model = typeof Model.Type
