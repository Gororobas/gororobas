import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { Handle } from "@gororobas/domain/common/primitives"
import { Option } from "effect"

import { PhotoGallery } from "../../ui/photo-gallery"
import { LoadContributions, LoadPage, LoadPhotos } from "./command"
import { ProfileComposition } from "./composition"
import {
  BookmarkResults,
  ContributionResults,
  PageResult,
  PhotoResults,
  PublicationResults,
} from "./model"

/**
 * Every collection's first page loads with the page, so the home tab can sample each of them.
 * Publications and saved articles wait for the page: they're found by the profile's ID, and
 * saved articles only load when the reader may see them.
 */
export const init = ProfileComposition.makeInit((handle: Handle, language: SupportedLanguage) => ({
  model: {
    handle,
    pageAsyncData: PageResult.Loading(),
    publicationsAsyncData: PublicationResults.Loading(),
    photosAsyncData: PhotoResults.Loading(),
    contributionsAsyncData: ContributionResults.Loading(),
    bookmarksAsyncData: BookmarkResults.Loading(),
    maybePublicationKindFilter: Option.none(),
    maybeBookmarkStateFilter: Option.none(),
    maybeBookmarkKindFilter: Option.none(),
    photoColumnCount: PhotoGallery.initialColumnCount,
  },
  commands: [
    LoadPage({ handle }),
    LoadPhotos({ handle, currentPage: 0 }),
    LoadContributions({ handle, language, currentPage: 0 }),
  ],
}))
