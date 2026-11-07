import { BookmarkState, PublicationKind } from "@gororobas/domain/common/enums"
import { Handle } from "@gororobas/domain/common/primitives"
import { CreditedMediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { ProfilePageData } from "@gororobas/domain/profiles/domain"
import { ProfileBookmark, ProfileWikiContribution } from "@gororobas/domain/profiles/profile-page"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { AsyncData } from "foldkit"

import { ClientFailure } from "../../lib/client-failure"
import { PopoverDrawerBlock } from "../../ui/popover-drawer"

export const PageResult = AsyncData.Schema(ProfilePageData, ClientFailure)

/**
 * A collection loaded a page at a time, as readers scroll to its end. `Refreshing` while the next
 * page loads; `Stale` when it failed, keeping what had loaded.
 */
const pagedResults = <
  Item extends Schema.Top & { readonly DecodingServices: never; readonly EncodingServices: never },
>(
  item: Item,
) =>
  AsyncData.Schema(
    Schema.Struct({
      items: Schema.Array(item),
      loadedPageCount: Schema.Int,
      /** A full page may have more after it; a shorter one is the last. */
      hasMore: Schema.Boolean,
    }),
    ClientFailure,
  )

export const PublicationResults = pagedResults(ApiPublicationCardData)
export const PhotoResults = pagedResults(CreditedMediaAssetRow)
export const ContributionResults = pagedResults(ProfileWikiContribution)
export const BookmarkResults = pagedResults(ProfileBookmark)

/** The profile's collections, each loaded and paged on its own. */
export const Collection = Schema.Literals(["Publications", "Photos", "Contributions", "Bookmarks"])
export type Collection = typeof Collection.Type

export const Model = Schema.Struct({
  handle: Handle,
  pageAsyncData: PageResult.schema,
  /** Loads once the page has, as publications are found by the profile's ID. */
  publicationsAsyncData: PublicationResults.schema,
  photosAsyncData: PhotoResults.schema,
  contributionsAsyncData: ContributionResults.schema,
  /** Idle while the reader may not see what the profile saved. */
  bookmarksAsyncData: BookmarkResults.schema,
  maybePublicationKindFilter: Schema.Option(PublicationKind),
  maybeBookmarkStateFilter: Schema.Option(BookmarkState),
  maybeBookmarkKindFilter: Schema.Option(WikiArticleKind),
  /** The photo gallery lays photos out in JavaScript, so it follows the viewport's width. */
  photoColumnCount: Schema.Int,
  /** One per photo shown, crediting who took it; created as photos load. */
  photoCredits: Schema.Array(PopoverDrawerBlock.Model),
})

export type Model = typeof Model.Type
