import { modifyFields } from "foldkit/struct"

import { LoadPublications } from "./command"
import { ProfileComposition } from "./composition"
import { makeFieldsStep } from "./definition"
import {
  BookmarkResults,
  ContributionResults,
  PageResult,
  PhotoResults,
  PublicationResults,
} from "./model"

export const update = ProfileComposition.makeUpdate({
  SucceededLoadPage: (model, { page }) => ({
    model: modifyFields(model, { pageAsyncData: () => PageResult.Success({ data: page }) }),
    commands: [LoadPublications({ ownerProfileId: page.id })],
  }),
  FailedLoadPage: makeFieldsStep.fromMessage(({ error }) => ({
    pageAsyncData: () => PageResult.Failure({ error }),
    publicationsAsyncData: () => PublicationResults.Idle(),
  })),
  SucceededLoadPublications: makeFieldsStep.fromMessage(({ publications }) => ({
    publicationsAsyncData: () => PublicationResults.Success({ data: publications }),
  })),
  FailedLoadPublications: makeFieldsStep.fromMessage(({ error }) => ({
    publicationsAsyncData: () => PublicationResults.Failure({ error }),
  })),
  SucceededLoadPhotos: makeFieldsStep.fromMessage(({ photos }) => ({
    photosAsyncData: () => PhotoResults.Success({ data: photos }),
  })),
  FailedLoadPhotos: makeFieldsStep.fromMessage(({ error }) => ({
    photosAsyncData: () => PhotoResults.Failure({ error }),
  })),
  SucceededLoadContributions: makeFieldsStep.fromMessage(({ contributions }) => ({
    contributionsAsyncData: () => ContributionResults.Success({ data: contributions }),
  })),
  FailedLoadContributions: makeFieldsStep.fromMessage(({ error }) => ({
    contributionsAsyncData: () => ContributionResults.Failure({ error }),
  })),
  SucceededLoadBookmarks: makeFieldsStep.fromMessage(({ bookmarks }) => ({
    bookmarksAsyncData: () => BookmarkResults.Success({ data: bookmarks }),
  })),
  FailedLoadBookmarks: makeFieldsStep.fromMessage(({ error }) => ({
    bookmarksAsyncData: () => BookmarkResults.Failure({ error }),
  })),
  ClickedPublicationKindFilter: makeFieldsStep.fromMessage(({ maybeKind }) => ({
    maybePublicationKindFilter: () => maybeKind,
  })),
  ClickedBookmarkStateFilter: makeFieldsStep.fromMessage(({ maybeState }) => ({
    maybeBookmarkStateFilter: () => maybeState,
  })),
  ChangedPhotoColumnCount: makeFieldsStep.fromMessage(({ columnCount }) => ({
    photoColumnCount: () => columnCount,
  })),
})
