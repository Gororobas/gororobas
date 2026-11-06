import { HashMap, Option } from "effect"
import { AsyncData, Update } from "foldkit"
import { initAndAppend } from "foldkit/bindingInit"
import { modifyFields } from "foldkit/struct"

import {
  CHILD_PLACES_PAGE_SIZE,
  LoadBookmarkers,
  LoadChildPlaces,
  LoadPublications,
  SaveBookmark,
} from "./command"
import { AttributionsBinding, BookmarkPickerBinding, WikiArticleComposition } from "./composition"
import { makeFieldsStep, makeStep } from "./definition"
import {
  BookmarkSaving,
  BookmarkerResults,
  ChildPlaceResults,
  ContributorResults,
  CultivarResults,
  PageResult,
  PublicationResults,
  RelatedResults,
} from "./model"
import { articlePhotos } from "./view/photos"

export const update = WikiArticleComposition.makeUpdate({
  SucceededLoadPage: (model, { page }) =>
    Update.combineSteps([
      makeStep((stepModel) => ({
        model: modifyFields(stepModel, {
          pageAsyncData: () => PageResult.Success({ data: page }),
        }),
        commands: [LoadPublications({ wikiArticleId: page.id })],
      })),
      ...articlePhotos(page).map(({ creditId }) =>
        makeStep((stepModel) =>
          initAndAppend(AttributionsBinding, stepModel, {
            key: creditId,
            args: [{ id: creditId }],
          }),
        ),
      ),
    ])(model),
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
  SucceededLoadCultivars: makeFieldsStep.fromMessage(({ cultivars }) => ({
    cultivarsAsyncData: () => CultivarResults.Success({ data: cultivars }),
  })),
  FailedLoadCultivars: makeFieldsStep.fromMessage(({ error }) => ({
    cultivarsAsyncData: () => CultivarResults.Failure({ error }),
  })),
  SucceededLoadChildPlaces: makeFieldsStep.fromMessage(({ page }) => ({
    childPlacesAsyncData: (current) =>
      ChildPlaceResults.Success({
        data: Option.match(AsyncData.getData(current), {
          onNone: () => page,
          onSome: (loaded) => ({ ...page, places: [...loaded.places, ...page.places] }),
        }),
      }),
  })),
  FailedLoadChildPlaces: makeFieldsStep.fromMessage(({ error }) => ({
    childPlacesAsyncData: (current) =>
      Option.match(AsyncData.getData(current), {
        onNone: () => ChildPlaceResults.Failure({ error }),
        onSome: (data) => ChildPlaceResults.Stale({ error, data }),
      }),
  })),
  ClickedLoadMoreChildPlaces: (model) =>
    Option.match(
      Option.filter(
        AsyncData.getData(model.childPlacesAsyncData),
        (loaded) =>
          !AsyncData.isRefreshing(model.childPlacesAsyncData) &&
          loaded.places.length < loaded.totalCount,
      ),
      {
        onNone: () => ({ model }),
        onSome: (loaded) => ({
          model: modifyFields(model, {
            childPlacesAsyncData: () => ChildPlaceResults.Refreshing({ data: loaded }),
          }),
          commands: [
            LoadChildPlaces({
              lookup: model.lookup,
              currentPage: Math.floor(loaded.places.length / CHILD_PLACES_PAGE_SIZE),
            }),
          ],
        }),
      },
    ),
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
  // Choosing closes the popover or drawer that offered the choice.
  SelectedBookmarkState: (model, { maybeState }) =>
    Update.combineSteps(
      BookmarkSaving.guards.Saving(model.bookmarkSaving)
        ? []
        : [
            makeStep((current) => ({
              model: modifyFields(current, { bookmarkSaving: () => BookmarkSaving.Saving() }),
              commands: [SaveBookmark({ lookup: current.lookup, maybeState })],
            })),
            BookmarkPickerBinding.requestClose(),
          ],
    )(model),
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
  ChangedPhotoColumnCount: makeFieldsStep.fromMessage(({ columnCount }) => ({
    photoColumnCount: () => columnCount,
  })),
})
