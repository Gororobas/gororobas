import { HashMap, Option } from "effect"
import { AsyncData } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { LoadBookmarkers, LoadPublications, SaveBookmark } from "./command"
import { WikiArticleComposition } from "./composition"
import { makeFieldsStep } from "./definition"
import {
  BookmarkSaving,
  BookmarkerResults,
  ContributorResults,
  PageResult,
  PublicationResults,
  RelatedResults,
} from "./model"

export const update = WikiArticleComposition.makeUpdate({
  SucceededLoadPage: (model, { page }) => ({
    model: modifyFields(model, { pageAsyncData: () => PageResult.Success({ data: page }) }),
    commands: [LoadPublications({ wikiArticleId: page.id })],
  }),
  FailedLoadPage: makeFieldsStep.fromMessage(({ error }) => ({
    pageAsyncData: () => PageResult.Failure({ error }),
    publicationsAsyncData: () => PublicationResults.Idle(),
  })),
  SucceededLoadRelated: makeFieldsStep.fromMessage(({ articles }) => ({
    relatedAsyncData: () => RelatedResults.Success({ data: articles }),
  })),
  FailedLoadRelated: makeFieldsStep.fromMessage(({ error }) => ({
    relatedAsyncData: () => RelatedResults.Failure({ error }),
  })),
  SucceededLoadBookmarkers: makeFieldsStep.fromMessage(({ bookmarkers }) => ({
    bookmarkersAsyncData: () => BookmarkerResults.Success({ data: bookmarkers }),
  })),
  FailedLoadBookmarkers: makeFieldsStep.fromMessage(({ error }) => ({
    bookmarkersAsyncData: () => BookmarkerResults.Failure({ error }),
  })),
  SucceededLoadContributors: makeFieldsStep.fromMessage(({ contributors }) => ({
    contributorsAsyncData: () => ContributorResults.Success({ data: contributors }),
  })),
  FailedLoadContributors: makeFieldsStep.fromMessage(({ error }) => ({
    contributorsAsyncData: () => ContributorResults.Failure({ error }),
  })),
  SucceededLoadPublications: makeFieldsStep.fromMessage(({ publications }) => ({
    publicationsAsyncData: () => PublicationResults.Success({ data: publications }),
  })),
  FailedLoadPublications: makeFieldsStep.fromMessage(({ error }) => ({
    publicationsAsyncData: () => PublicationResults.Failure({ error }),
  })),
  UpdatedViewerBookmarks: makeFieldsStep.fromMessage(({ bookmarks }) => ({
    viewerBookmarks: () => bookmarks,
  })),
  SelectedBookmarkState: (model, { maybeState }) =>
    BookmarkSaving.guards.Saving(model.bookmarkSaving)
      ? { model }
      : {
          model: modifyFields(model, { bookmarkSaving: () => BookmarkSaving.Saving() }),
          commands: [SaveBookmark({ lookup: model.lookup, maybeState })],
        },
  SucceededSaveBookmark: (model, { maybeState }) => ({
    model: modifyFields(model, {
      bookmarkSaving: () => BookmarkSaving.Idle(),
      viewerBookmarks: (bookmarks) =>
        Option.match(AsyncData.getData(model.pageAsyncData), {
          onNone: () => bookmarks,
          onSome: (page) =>
            Option.match(maybeState, {
              onNone: () => HashMap.remove(bookmarks, page.id),
              onSome: (state) => HashMap.set(bookmarks, page.id, state),
            }),
        }),
    }),
    commands: [LoadBookmarkers({ lookup: model.lookup })],
  }),
  FailedSaveBookmark: makeFieldsStep.fromMessage(({ error }) => ({
    bookmarkSaving: () => BookmarkSaving.Failed({ error }),
  })),
  ClickedBookmarkerFilter: makeFieldsStep.fromMessage(({ maybeState }) => ({
    maybeBookmarkerFilter: () => maybeState,
  })),
  ClickedRelatedKindFilter: makeFieldsStep.fromMessage(({ maybeKind }) => ({
    maybeRelatedKindFilter: () => maybeKind,
  })),
  ClickedPhotoCategoryFilter: makeFieldsStep.fromMessage(({ maybeCategory }) => ({
    maybePhotoCategoryFilter: () => maybeCategory,
  })),
  ClickedPublicationKindFilter: makeFieldsStep.fromMessage(({ maybeKind }) => ({
    maybePublicationKindFilter: () => maybeKind,
  })),
})
