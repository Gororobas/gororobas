import type { Handle } from "@gororobas/domain/common/primitives"
import { Option } from "effect"

import { PhotoGallery } from "../../ui/photo-gallery"
import { LoadBookmarks, LoadContributions, LoadPage, LoadPhotos } from "./command"
import { ProfileComposition } from "./composition"
import {
  BookmarkResults,
  ContributionResults,
  PageResult,
  PhotoResults,
  PublicationResults,
} from "./model"

/** Every collection loads with the page, so the home tab can sample each of them. */
export const init = ProfileComposition.makeInit((handle: Handle) => ({
  model: {
    handle,
    pageAsyncData: PageResult.Loading(),
    publicationsAsyncData: PublicationResults.Loading(),
    photosAsyncData: PhotoResults.Loading(),
    contributionsAsyncData: ContributionResults.Loading(),
    bookmarksAsyncData: BookmarkResults.Loading(),
    maybePublicationKindFilter: Option.none(),
    maybeBookmarkStateFilter: Option.none(),
    photoColumnCount: PhotoGallery.initialColumnCount,
  },
  commands: [
    LoadPage({ handle }),
    LoadPhotos({ handle }),
    LoadContributions({ handle }),
    LoadBookmarks({ handle }),
  ],
}))
